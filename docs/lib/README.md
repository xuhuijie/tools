# docs/lib — 随包携带的第三方库

这些文件是从公开 CDN **一次性下载后放进仓库**的，页面用相对路径 `<script src="./lib/xxx.js">`
引用，运行时**不联网**，离线可用。仓库原先「零依赖单文件、双击即用」的限制已按 Issue #20 取消：
现在允许携带库文件，但仍要求「打开即用、不需要装环境、不需要起服务」。

| 文件 | 版本 | 许可 | 用途 |
| --- | --- | --- | --- |
| `qrcode-generator.js` | 1.4.4 | MIT | 二维码编码 |
| `jsqr.js` | 1.4.0 | Apache-2.0 | 二维码识别（从图片解码） |
| `bwip-js.js` | 4.5.1 | BSD-3-Clause | 一维码 / 二维码生成（Code128、EAN、UPC 等） |
| `forge.js` | 1.3.1 | BSD-3-Clause / GPL-2.0 双许可 | X.509 证书解析、RSA/EC 密钥生成、JWT 的 RS\*/ES\* 签名验签 |
| `dompurify.js` | 3.1.7 | Apache-2.0 / MPL-2.0 | HTML 净化，供 Markdown / HTML 编辑器预览 |
| `marked.js` | 12.0.2 | MIT | Markdown 转 HTML |

升级方式：跑 `tools/vendor.sh`（版本号写死在脚本里，保证可复现），它会重新下载到本目录。
