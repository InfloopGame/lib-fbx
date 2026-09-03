# Product Context

引擎与工具链需要在 Node / 浏览器中读取 FBX，而不绑定 Python SDK 或宿主 DCC。

当前可用：`detectFormat()` 区分 binary / ascii。`parse()` 识别格式后抛出 `NOT_IMPLEMENTED`，作为后续解析器的入口。
