// FBX 节点树的通用值枚举；用 IndexMap 保持子节点插入顺序，与 TS 版本一致。

use indexmap::IndexMap;

pub type FbxObject = IndexMap<String, FbxValue>;

#[derive(Clone, Debug)]
pub enum FbxValue {
    Null,
    Bool(bool),
    /// 所有整数与浮点属性均以 f64 存储，行为对齐 TS 侧的 JavaScript number（受 2^53 精度限制）。
    Number(f64),
    String(String),
    /// 原始字节。序列化为 JS Uint8Array，对应 TS 版返回的 ArrayBuffer 二进制。
    Bytes(Vec<u8>),
    BoolArray(Vec<bool>),
    /// 数字数组。序列化为 JS Float64Array，避免逐元素跨 wasm↔js 边界。
    NumberArray(Vec<f64>),
    Object(FbxObject),
    Array(Vec<FbxValue>),
}

impl FbxValue {
    pub fn is_number(&self) -> bool {
        matches!(self, FbxValue::Number(_))
    }

    pub fn is_empty_string(&self) -> bool {
        matches!(self, FbxValue::String(s) if s.is_empty())
    }
}
