# Product Context

引擎与工具链需要在 Node / 浏览器中读取 FBX，而不绑定 Python SDK 或宿主 DCC。

当前可用：`detectFormat()` 区分 binary / ascii；`parse()` 产出 `FbxParseResult`（文件 tree）；`buildScene()` 把 tree 组装成 SDK 风格的 `FbxScene`（Importer 只读对象图，含 DisplayLayer）。角色文件已对 Autodesk SDK dump 金标准。
