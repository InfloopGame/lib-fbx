// FBX 二进制底层读取器；对应 TS 的 src/binary-reader.ts。

pub struct BinaryReader<'a> {
    data: &'a [u8],
    offset: usize,
}

impl<'a> BinaryReader<'a> {
    pub fn new(data: &'a [u8]) -> Self {
        Self { data, offset: 0 }
    }

    pub fn get_offset(&self) -> usize {
        self.offset
    }

    pub fn size(&self) -> usize {
        self.data.len()
    }

    pub fn skip(&mut self, n: usize) {
        self.offset += n;
    }

    fn take(&mut self, n: usize) -> Result<&'a [u8], String> {
        let end = self
            .offset
            .checked_add(n)
            .ok_or_else(|| "read overflow".to_string())?;
        if end > self.data.len() {
            return Err(format!(
                "read out of bounds: offset {} + {} > {}",
                self.offset,
                n,
                self.data.len()
            ));
        }
        let slice = &self.data[self.offset..end];
        self.offset = end;
        Ok(slice)
    }

    pub fn get_u8(&mut self) -> Result<u8, String> {
        Ok(self.take(1)?[0])
    }

    pub fn get_bool(&mut self) -> Result<bool, String> {
        Ok((self.get_u8()? & 1) == 1)
    }

    pub fn get_i16(&mut self) -> Result<i16, String> {
        let s = self.take(2)?;
        Ok(i16::from_le_bytes([s[0], s[1]]))
    }

    pub fn get_u32(&mut self) -> Result<u32, String> {
        let s = self.take(4)?;
        Ok(u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
    }

    pub fn get_i32(&mut self) -> Result<i32, String> {
        Ok(self.get_u32()? as i32)
    }

    pub fn get_i64(&mut self) -> Result<i64, String> {
        let s = self.take(8)?;
        Ok(i64::from_le_bytes([
            s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7],
        ]))
    }

    pub fn get_u64(&mut self) -> Result<u64, String> {
        let s = self.take(8)?;
        Ok(u64::from_le_bytes([
            s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7],
        ]))
    }

    pub fn get_f32(&mut self) -> Result<f32, String> {
        let s = self.take(4)?;
        Ok(f32::from_le_bytes([s[0], s[1], s[2], s[3]]))
    }

    pub fn get_f64(&mut self) -> Result<f64, String> {
        let s = self.take(8)?;
        Ok(f64::from_le_bytes([
            s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7],
        ]))
    }

    pub fn get_bytes(&mut self, size: usize) -> Result<Vec<u8>, String> {
        Ok(self.take(size)?.to_vec())
    }

    /// TextDecoder 默认 utf-8 且遇到 null byte 截断，对应 TS 里的 getString。
    pub fn get_string(&mut self, size: usize) -> Result<String, String> {
        let raw = self.take(size)?;
        let end = raw.iter().position(|&b| b == 0).unwrap_or(raw.len());
        Ok(String::from_utf8_lossy(&raw[..end]).into_owned())
    }

    pub fn get_bool_array(&mut self, size: usize) -> Result<Vec<bool>, String> {
        let mut v = Vec::with_capacity(size);
        for _ in 0..size {
            v.push(self.get_bool()?);
        }
        Ok(v)
    }

    pub fn get_i32_array(&mut self, size: usize) -> Result<Vec<f64>, String> {
        let mut v = Vec::with_capacity(size);
        for _ in 0..size {
            v.push(self.get_i32()? as f64);
        }
        Ok(v)
    }

    pub fn get_i64_array(&mut self, size: usize) -> Result<Vec<f64>, String> {
        let mut v = Vec::with_capacity(size);
        for _ in 0..size {
            v.push(self.get_i64()? as f64);
        }
        Ok(v)
    }

    pub fn get_f32_array(&mut self, size: usize) -> Result<Vec<f64>, String> {
        let mut v = Vec::with_capacity(size);
        for _ in 0..size {
            v.push(self.get_f32()? as f64);
        }
        Ok(v)
    }

    pub fn get_f64_array(&mut self, size: usize) -> Result<Vec<f64>, String> {
        let mut v = Vec::with_capacity(size);
        for _ in 0..size {
            v.push(self.get_f64()?);
        }
        Ok(v)
    }
}
