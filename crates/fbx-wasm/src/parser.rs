// FBX 二进制解析器；对应 TS 的 src/binary-parser.ts，行为需保持一致。

use indexmap::IndexMap;

use crate::inflate::inflate;
use crate::reader::BinaryReader;
use crate::value::{FbxObject, FbxValue};

pub struct ParseResult {
    pub version: u32,
    pub tree: FbxObject,
}

/// 解析中间产物：把 `name` / `single_property` 从最终 tree 里剥离出来，
/// 只在解析栈上传递，减少每个 node 两次 Reflect::set。
struct RawNode {
    name: String,
    single_property: bool,
    object: FbxObject,
}

pub fn parse(bytes: &[u8]) -> Result<ParseResult, String> {
    let mut reader = BinaryReader::new(bytes);
    reader.skip(23);
    let version = reader.get_u32()?;
    if version < 6100 {
        return Err(format!(
            "FBX version not supported, FileVersion: {version}"
        ));
    }

    let mut tree: FbxObject = IndexMap::new();
    while !end_of_content(&reader) {
        match parse_node(&mut reader, version)? {
            Some(raw) => {
                // TS 侧使用 `FbxTree.add(name, node)`，多次同名会覆盖。这里保留同样行为。
                tree.insert(raw.name, FbxValue::Object(raw.object));
            }
            None => break,
        }
    }

    Ok(ParseResult { version, tree })
}

fn end_of_content(reader: &BinaryReader) -> bool {
    if reader.size() % 16 == 0 {
        ((reader.get_offset() + 160 + 16) & !0xf) >= reader.size()
    } else {
        reader.get_offset() + 160 + 16 >= reader.size()
    }
}

fn parse_node(reader: &mut BinaryReader, version: u32) -> Result<Option<RawNode>, String> {
    let mut node: FbxObject = IndexMap::new();

    let end_offset = if version >= 7500 {
        reader.get_u64()?
    } else {
        reader.get_u32()? as u64
    };
    let num_properties = if version >= 7500 {
        reader.get_u64()? as usize
    } else {
        reader.get_u32()? as usize
    };
    let _property_list_len = if version >= 7500 {
        reader.get_u64()?
    } else {
        reader.get_u32()? as u64
    };

    let name_len = reader.get_u8()? as usize;
    let name = reader.get_string(name_len)?;

    if end_offset == 0 {
        return Ok(None);
    }

    let mut property_list: Vec<FbxValue> = Vec::with_capacity(num_properties);
    let mut errored = false;
    for _ in 0..num_properties {
        match parse_property(reader) {
            Ok(v) => property_list.push(v),
            Err(_) => {
                errored = true;
                break;
            }
        }
    }
    if errored {
        let cur = reader.get_offset() as u64;
        if end_offset > cur {
            reader.skip((end_offset - cur) as usize);
        }
        return Ok(None);
    }

    let single_property = num_properties == 1 && reader.get_offset() as u64 == end_offset;

    while end_offset > reader.get_offset() as u64 {
        if let Some(sub) = parse_node(reader, version)? {
            parse_sub_node(&name, &mut node, sub);
        }
    }

    // 关键性能点：只从 property_list 的头部克隆 metadata（id/attrName/attrType 通常是数字或短字符串），
    // 然后把整个 property_list move 进 node —— 避免克隆百万级的 NumberArray。
    let id_val = property_list
        .first()
        .filter(|v| v.is_number())
        .cloned();
    let attr_name_val = property_list
        .get(1)
        .filter(|v| !v.is_empty_string())
        .cloned()
        .map(strip_type_prefix);
    let attr_type_val = property_list
        .get(2)
        .filter(|v| !v.is_empty_string())
        .cloned();

    node.insert(
        "propertyList".to_string(),
        FbxValue::Array(property_list),
    );

    if let Some(v) = id_val {
        node.insert("id".to_string(), v);
    }
    if let Some(v) = attr_name_val {
        node.insert("attrName".to_string(), v);
    }
    if let Some(v) = attr_type_val {
        node.insert("attrType".to_string(), v);
    }
    if !name.is_empty() {
        node.insert("name".to_string(), FbxValue::String(name.clone()));
    }

    Ok(Some(RawNode {
        name,
        single_property,
        object: node,
    }))
}

fn is_array_like(v: &FbxValue) -> bool {
    matches!(
        v,
        FbxValue::BoolArray(_) | FbxValue::NumberArray(_) | FbxValue::Array(_)
    )
}

/// TS 侧使用 `String(subNode.id)`；对整数直接 to_string，对小数用 JS 的 `String(number)` 语义。
fn get_id_string(node: &FbxObject) -> Option<String> {
    match node.get("id") {
        Some(FbxValue::Number(n)) => Some(format_js_number(*n)),
        _ => None,
    }
}

fn format_js_number(n: f64) -> String {
    if n.is_finite() && n.fract() == 0.0 && n.abs() < 1.0e21 {
        format!("{}", n as i64)
    } else {
        format!("{n}")
    }
}

/// 与 TS 的 `str.replace(/^(\w+)::/, '')` 语义一致。
fn strip_type_prefix(value: FbxValue) -> FbxValue {
    match value {
        FbxValue::String(s) => {
            if let Some(idx) = s.find("::") {
                let prefix = &s[..idx];
                if !prefix.is_empty()
                    && prefix.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
                {
                    return FbxValue::String(s[idx + 2..].to_string());
                }
            }
            FbxValue::String(s)
        }
        other => other,
    }
}

fn parse_sub_node(parent_name: &str, node: &mut FbxObject, sub: RawNode) {
    let RawNode {
        name: sub_name,
        single_property,
        object: mut sub,
    } = sub;

    if single_property {
        // 关键性能点：不 clone propertyList[0]（可能是百万元素的 NumberArray），
        // 直接把整个 propertyList move 出来，取出第 0 项。propertyList 里改放
        // 一个 empty Array，行为对齐 TS（TS 里 propertyList 依旧存在，我们仅保留引用语义等价）。
        let pl_owned = sub.shift_remove("propertyList");
        let first_value = match pl_owned {
            Some(FbxValue::Array(mut a)) if !a.is_empty() => Some(a.remove(0)),
            _ => None,
        };
        if let Some(value) = first_value {
            if is_array_like(&value) {
                sub.insert("a".to_string(), value);
                // propertyList 已被移走；为深度对比稳定重新写回一个空 Array
                sub.insert("propertyList".to_string(), FbxValue::Array(Vec::new()));
                node.insert(sub_name, FbxValue::Object(sub));
            } else {
                node.insert(sub_name, value);
            }
        }
        return;
    }

    if parent_name == "Connections" && (sub_name == "C" || sub_name == "Connect") {
        // 从 sub 里 move 出 propertyList，然后 skip(1) 拿到 tail owned；避免 clone
        let tail: Vec<FbxValue> = match sub.shift_remove("propertyList") {
            Some(FbxValue::Array(a)) => a.into_iter().skip(1).collect(),
            _ => Vec::new(),
        };
        let entry = node
            .entry("connections".to_string())
            .or_insert_with(|| FbxValue::Array(Vec::new()));
        if let FbxValue::Array(list) = entry {
            list.push(FbxValue::Array(tail));
        }
        return;
    }

    if sub_name == "Properties70" || sub_name == "Properties60" {
        for (k, v) in sub.into_iter() {
            node.insert(k, v);
        }
        return;
    }

    if parent_name == "Properties70" && sub_name == "P" {
        if let Some(FbxValue::Array(pl)) = sub.shift_remove("propertyList") {
            assign_property70(node, pl);
        }
        return;
    }
    if parent_name == "Properties60" && sub_name == "Property" {
        if let Some(FbxValue::Array(pl)) = sub.shift_remove("propertyList") {
            assign_property60(node, pl);
        }
        return;
    }

    // 关键性能点：用 get_mut 就地修改，避免 clone 大 bucket（O(N^2) → O(1)）。
    // 顺序对齐 TS 里的 `else if` 链：PoseNode 分支优先级高于 bucket。
    if let Some(existing) = node.get_mut(&sub_name) {
        if sub_name == "PoseNode" {
            match existing {
                FbxValue::Array(list) => list.push(FbxValue::Object(sub)),
                _ => {
                    let prev = std::mem::replace(existing, FbxValue::Null);
                    *existing = FbxValue::Array(vec![prev, FbxValue::Object(sub)]);
                }
            }
        } else if let FbxValue::Object(bucket) = existing {
            // 与 TS 对齐：id 缺失时 `String(undefined) === "undefined"` 会被用作 bucket key
            // （TS 的 `bucket[String(subNode.id)] = subNode`）。这是 TS 上游的怪行为
            // ——多个无 id 节点会互相覆盖——但为保持一致必须复刻。
            let id_key = get_id_string(&sub).unwrap_or_else(|| "undefined".to_string());
            if !bucket.contains_key(&id_key) {
                bucket.insert(id_key, FbxValue::Object(sub));
            }
        }
        // 其它冲突：对齐 TS 保留原值（no-op）
        return;
    }

    // existing == None：新建
    if let Some(id_key) = get_id_string(&sub) {
        let mut bucket: FbxObject = IndexMap::new();
        bucket.insert(id_key, FbxValue::Object(sub));
        node.insert(sub_name, FbxValue::Object(bucket));
    } else {
        node.insert(sub_name, FbxValue::Object(sub));
    }
}

fn lcl_replace(s: &str) -> String {
    if let Some(rest) = s.strip_prefix("Lcl ") {
        format!("Lcl_{rest}")
    } else {
        s.to_string()
    }
}

fn is_vector_type(t: &str) -> bool {
    matches!(t, "Color" | "ColorRGB" | "Vector" | "Vector3D") || t.starts_with("Lcl_")
}

fn make_prop_value(inner_type1: String, inner_type2: String, flag: String, value: FbxValue) -> FbxValue {
    let mut obj: FbxObject = IndexMap::new();
    obj.insert("type".to_string(), FbxValue::String(inner_type1));
    obj.insert("type2".to_string(), FbxValue::String(inner_type2));
    obj.insert("flag".to_string(), FbxValue::String(flag));
    obj.insert("value".to_string(), value);
    FbxValue::Object(obj)
}

fn take_at(pl: &mut Vec<FbxValue>, idx: usize) -> FbxValue {
    if idx < pl.len() {
        std::mem::replace(&mut pl[idx], FbxValue::Null)
    } else {
        FbxValue::Null
    }
}

fn take_string(pl: &mut Vec<FbxValue>, idx: usize) -> String {
    match take_at(pl, idx) {
        FbxValue::String(s) => s,
        _ => String::new(),
    }
}

fn assign_property70(node: &mut FbxObject, mut pl: Vec<FbxValue>) {
    let inner_name = lcl_replace(&take_string(&mut pl, 0));
    let inner_type1 = lcl_replace(&take_string(&mut pl, 1));
    let inner_type2 = take_string(&mut pl, 2);
    let inner_flag = take_string(&mut pl, 3);

    let value = if is_vector_type(&inner_type1) {
        FbxValue::Array(vec![take_at(&mut pl, 4), take_at(&mut pl, 5), take_at(&mut pl, 6)])
    } else {
        take_at(&mut pl, 4)
    };

    node.insert(inner_name, make_prop_value(inner_type1, inner_type2, inner_flag, value));
}

fn assign_property60(node: &mut FbxObject, mut pl: Vec<FbxValue>) {
    let inner_name = lcl_replace(&take_string(&mut pl, 0));
    let inner_type1 = lcl_replace(&take_string(&mut pl, 1));
    let inner_flag = take_string(&mut pl, 2);

    let value = if is_vector_type(&inner_type1) {
        FbxValue::Array(vec![take_at(&mut pl, 3), take_at(&mut pl, 4), take_at(&mut pl, 5)])
    } else {
        take_at(&mut pl, 3)
    };

    node.insert(
        inner_name,
        make_prop_value(inner_type1, String::new(), inner_flag, value),
    );
}

fn parse_property(reader: &mut BinaryReader) -> Result<FbxValue, String> {
    let type_byte = reader.get_u8()?;
    match type_byte as char {
        'C' => Ok(FbxValue::Bool(reader.get_bool()?)),
        'D' => Ok(FbxValue::Number(reader.get_f64()?)),
        'F' => Ok(FbxValue::Number(reader.get_f32()? as f64)),
        'I' => Ok(FbxValue::Number(reader.get_i32()? as f64)),
        'L' => Ok(FbxValue::Number(reader.get_i64()? as f64)),
        'R' => {
            let len = reader.get_u32()? as usize;
            Ok(FbxValue::Bytes(reader.get_bytes(len)?))
        }
        'S' => {
            let len = reader.get_u32()? as usize;
            Ok(FbxValue::String(reader.get_string(len)?))
        }
        'Y' => Ok(FbxValue::Number(reader.get_i16()? as f64)),
        'b' | 'c' | 'd' | 'f' | 'i' | 'l' => parse_array_property(reader, type_byte as char),
        other => Err(format!("Unknown property type \"{other}\"")),
    }
}

fn parse_array_property(reader: &mut BinaryReader, type_char: char) -> Result<FbxValue, String> {
    let array_length = reader.get_u32()? as usize;
    let encoding = reader.get_u32()?;
    let compressed_length = reader.get_u32()? as usize;

    if encoding == 0 {
        read_array(reader, type_char, array_length)
    } else {
        let compressed = reader.get_bytes(compressed_length)?;
        let decoded = inflate(&compressed)?;
        let mut sub = BinaryReader::new(&decoded);
        read_array(&mut sub, type_char, array_length)
    }
}

fn read_array(reader: &mut BinaryReader, type_char: char, size: usize) -> Result<FbxValue, String> {
    match type_char {
        'b' | 'c' => Ok(FbxValue::BoolArray(reader.get_bool_array(size)?)),
        'd' => Ok(FbxValue::NumberArray(reader.get_f64_array(size)?)),
        'f' => Ok(FbxValue::NumberArray(reader.get_f32_array(size)?)),
        'i' => Ok(FbxValue::NumberArray(reader.get_i32_array(size)?)),
        'l' => Ok(FbxValue::NumberArray(reader.get_i64_array(size)?)),
        other => Err(format!("Unknown array element type \"{other}\"")),
    }
}
