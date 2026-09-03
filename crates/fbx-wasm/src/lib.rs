// wasm-bindgen 入口。仅暴露 parse_binary，用于 lib-fbx 的 wasm 后端。
//
// 手写 to_js：不使用 serde-wasm-bindgen，因为它把 Vec<f64> 序列化为 JS Array 会
// 逐元素跨越 wasm↔js 边界，动画等含长数字数组的 FBX 会慢几十倍。这里对数字数组
// 走 Float64Array::from、字节数组走 Uint8Array::from，一次性拷出线性内存。
//
// 性能优化：
// - 常用键（"name" / "id" / "propertyList" / "P" 的属性字段等）被 cache 到线程局部
//   JsValue，避免每次 Reflect::set 都调用 JsValue::from_str（会在 JS heap 分配新 JsString）
// - 每一个 key 只在整个 wasm 生命周期分配一次
// - 未命中 cache 的键回退到 from_str（用户 FBX 里的少见字段）

use std::cell::RefCell;

use js_sys::{Array, Float64Array, Object, Reflect, Uint8Array};
use wasm_bindgen::prelude::*;

mod inflate;
mod parser;
mod reader;
mod value;

use parser::parse;
use value::{FbxObject, FbxValue};

thread_local! {
    /// 常见键 → 稳定 JsValue（JsString）。命中就直接复用；未命中则临时 from_str（不缓存，避免 map 无限增长）。
    static KEY_CACHE: RefCell<Option<KeyCache>> = const { RefCell::new(None) };
}

struct KeyCache {
    entries: Vec<(&'static str, JsValue)>,
    version: JsValue,
    tree: JsValue,
}

impl KeyCache {
    fn new() -> Self {
        const COMMON: &[&str] = &[
            "name",
            "id",
            "attrName",
            "attrType",
            "propertyList",
            "a",
            "connections",
            "type",
            "type2",
            "flag",
            "value",
            "PoseNode",
            "Node",
            "Objects",
            "Connections",
            "Properties70",
            "Properties60",
            "P",
            "Property",
            "C",
            "Connect",
        ];
        Self {
            entries: COMMON.iter().map(|k| (*k, JsValue::from_str(k))).collect(),
            version: JsValue::from_str("version"),
            tree: JsValue::from_str("tree"),
        }
    }

    fn get(&self, key: &str) -> Option<&JsValue> {
        self.entries.iter().find(|(k, _)| *k == key).map(|(_, v)| v)
    }
}

fn ensure_cache() {
    KEY_CACHE.with(|cell| {
        if cell.borrow().is_none() {
            *cell.borrow_mut() = Some(KeyCache::new());
        }
    });
}

/// 用不可变借用短暂读缓存里的 JsValue；返回一个 clone 供调用方使用，避免在
/// callback 里长时间持有借用（后续递归 with_key 会需要再借）。JsValue 内部
/// 是 Rc 引用计数，clone 廉价。
fn cached_key(key: &str) -> JsValue {
    KEY_CACHE.with(|cell| {
        let guard = cell.borrow();
        let cache = guard
            .as_ref()
            .expect("KEY_CACHE not initialised; call ensure_cache first");
        match cache.get(key) {
            Some(v) => v.clone(),
            None => JsValue::from_str(key),
        }
    })
}

fn version_key() -> JsValue {
    KEY_CACHE.with(|cell| cell.borrow().as_ref().unwrap().version.clone())
}

fn tree_key() -> JsValue {
    KEY_CACHE.with(|cell| cell.borrow().as_ref().unwrap().tree.clone())
}

#[wasm_bindgen]
pub fn parse_binary(bytes: &[u8]) -> Result<JsValue, JsValue> {
    ensure_cache();
    let result = parse(bytes).map_err(|e| JsValue::from_str(&e))?;
    let doc = Object::new();
    Reflect::set(&doc, &version_key(), &JsValue::from_f64(result.version as f64))?;
    Reflect::set(&doc, &tree_key(), &object_to_js(&result.tree))?;
    Ok(doc.into())
}

/// 调试用：直接调用 miniz_oxide 解压一段 zlib 数据，供 scripts/verify-inflate.ts 三方对比。
#[wasm_bindgen]
pub fn inflate_debug(bytes: &[u8]) -> Result<Vec<u8>, JsValue> {
    inflate::inflate(bytes).map_err(|e| JsValue::from_str(&e))
}

fn to_js(value: &FbxValue) -> JsValue {
    match value {
        // 使用 undefined 而非 null：TS 侧 assign_property70 里 `pl[i]` 越界会得到 undefined，
        // FbxValue::Null 本身也仅用作"缺失"占位（Rust 侧 take_at 越界的 fallback）。
        FbxValue::Null => JsValue::UNDEFINED,
        FbxValue::Bool(b) => JsValue::from_bool(*b),
        FbxValue::Number(n) => JsValue::from_f64(*n),
        FbxValue::String(s) => JsValue::from_str(s),
        FbxValue::Bytes(b) => Uint8Array::from(b.as_slice()).into(),
        FbxValue::BoolArray(a) => {
            let arr = Array::new_with_length(a.len() as u32);
            for (i, &v) in a.iter().enumerate() {
                arr.set(i as u32, JsValue::from_bool(v));
            }
            arr.into()
        }
        FbxValue::NumberArray(a) => Float64Array::from(a.as_slice()).into(),
        FbxValue::Object(obj) => object_to_js(obj).into(),
        FbxValue::Array(a) => {
            let arr = Array::new_with_length(a.len() as u32);
            for (i, v) in a.iter().enumerate() {
                arr.set(i as u32, to_js(v));
            }
            arr.into()
        }
    }
}

fn object_to_js(obj: &FbxObject) -> Object {
    let js = Object::new();
    for (k, v) in obj.iter() {
        // Reflect::set 只在极端场景失败（如冻结对象），此处新建对象不会失败。
        let key = cached_key(k.as_str());
        let _ = Reflect::set(&js, &key, &to_js(v));
    }
    js
}
