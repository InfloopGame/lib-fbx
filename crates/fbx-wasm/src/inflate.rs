// FBX 二进制数组属性使用 zlib 压缩。剥离 2 字节头 + 4 字节 Adler32，走 raw deflate。

use miniz_oxide::inflate::decompress_to_vec;

pub fn inflate(data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < 6 {
        return Err("inflate: input too short".to_string());
    }
    let cmf = data[0];
    let method = cmf & 0x0f;
    if method != 8 {
        return Err("inflate: unsupported compression method".to_string());
    }
    let raw = &data[2..data.len() - 4];
    decompress_to_vec(raw).map_err(|e| format!("inflate: {e}"))
}
