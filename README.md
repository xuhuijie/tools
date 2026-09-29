# caculate

计量工具 H5 页面集合，零依赖单文件，直接用浏览器打开即可使用。

- `docs/index.html` — 工具入口页
- `docs/calibration.html` — 电磁水表流量点校准计算
- `docs/gold.html` — 黄金价格换算与斐波那契回调计算
- `docs/flow.html` — 瞬时流量与流速换算
- `docs/checksum.html` — 校验和计算（CRC / 累加和 / 异或）
- `docs/md5.html` — 文件 / 文本 MD5 校验（含 SHA 系列，文件分块流式计算）
- `docs/tools.html` — 工具目录（metools.info 全站 142 个工具清单）
- `docs/base.html`、`docs/cipher.html`、`docs/hash.html`、`docs/number.html` —
  编码解码、古典密码、哈希校验、数字与单位
- `docs/color.html`、`docs/random.html`、`docs/net.html`、`docs/date.html` —
  颜色转换、随机生成、网络计算、日期与时间


## 流量点校准

按零点与误差百分比换算各流量点的校正数值：

```
校正数值 = 原始数值 + (原始数值 − 零点) ÷ 100 × 误差百分比
```

- 零点数值全局生效，一般取多次静水测量的平均值
- 每个流量点填「原始数值」与「误差百分比」，误差带符号：偏大填正、偏小填负
- 支持增删流量点、一键套用误差、清空误差、重置
- 结果区给出各点校正数值、修正量与代入过程，便于复核

## 黄金价格换算

在美元/盎司与人民币/克之间双向换算，并可按波段区间算斐波那契回调价位：

```
人民币/克 = 美元/盎司 × 汇率 ÷ 31.1034768
美元/盎司 = 人民币/克 × 31.1034768 ÷ 汇率
```

- 1 金衡盎司按 31.1034768 克计算（央行与上海黄金交易所采用值）
- **双向输入**：美元/盎司与人民币/克两个框都能填，改哪一侧，另一侧即时换算出来
- 汇率固定为换算系数，单独一个输入框，并支持自动获取
- 结果区同时给出人民币/克与人民币/千克，附换算过程与反向核对，便于复核
- 结果已展示时修改任一参数会即时刷新，无需重复点击

### 双向输入

两个价格框互为输入，不用先想清楚「该填哪个框」：

- 改美元/盎司 → 人民币/克 实时按当前汇率算出；反过来同理
- 两个框都自洽：以最后编辑的一侧为真值，另一侧由公式推出，不会出现两框互相矛盾
- 改汇率时保持最后编辑的那一侧不变，只让另一侧跟着变，避免输入被冲掉
- 正在编辑的框不会被覆盖，不会出现「打一个字被换掉」的循环同步问题
- 编辑中的框若为空或非正数会即时标红提示，但不会清空对面，方便连续重填
- 页面打开时两个框已按默认值与自动取到的汇率对齐

### 汇率自动获取

汇率不必手查，页面会自动从公开接口取当前值，并在汇率下方显示取到的数值、更新时间与来源：

| 顺序 | 接口 | 说明 |
| --- | --- | --- |
| 1 | `open.er-api.com/v6/latest/USD` | exchangerate-api.com 免费版，免密钥 |
| 2 | `api.frankfurter.dev/v1/latest` | frankfurter.dev，欧洲央行数据源，免密钥 |

- 接口按上表顺序尝试，前一个失败自动降级到下一个；全部失败则保留默认值并提示手动填写
- 请求带 10 秒超时，接口卡住不会拖住页面；离线时直接提示手动填写
- 取到的是市场中间价，仅作换算参考；银行买卖价/金店售价会有价差，实际成交以机构报价为准
- 汇率框仍可手动填写，手动改动后自动获取的提示会复位

> 这是本仓库唯一涉及网络的功能：获取失败时页面其余部分完全可用，不影响离线打开与手算。

### 斐波那契回调价位

同一页面下半部分按波段区间算回调位：

```
回调位 = 波段高点 − (波段高点 − 波段低点) × 回调比例
```

- 固定给出 0% / 23.6% / 38.2% / 50% / 61.8% / 78.6% / 100% 七个回调位，并高亮黄金分割 61.8%
- **方向**：默认按上升波段回撤，回调比例越大价位越低，0% 即波段高点、100% 即波段低点；
  填成高点低于低点会提示所填区间为回撤方向，避免方向反了还算出结果
- **价位单位跟随汇率**：默认沿用上方「美元兑人民币汇率」，把美元区间折成元/克。
  折算方式与上方换算完全一致，**按汇率折算后还要除以 1 金衡盎司的克数（31.1034768）**，
  不能只乘汇率；单位框留空即跟随，也可手填（填 1 即按美元/盎司显示），或点「套用当前汇率」一键填入
- 结果区给出各回调位价位与代入过程，人民币显示时同时附美元/盎司原值，便于复核

示例：波段 2650 → 2000 美元/盎司，汇率 7.25：

```
524.06 元/克 = [2650 − (2650 − 2000) × 61.8%] × 7.25 ÷ 31.1034768
```

## 瞬时流量与流速换算

在瞬时流量 m³/h 与流速 m/s 之间双向换算，按口径与缩进百分比折算流通截面积：

```
流速 = 流量 ÷ 3600 ÷ (π × 等效内径² ÷ 4)
等效内径 = 口径 DN × (1 − 缩进百分比 ÷ 100)
```

- 口径按管段内径（mm）填入；缩进百分比是内径被削掉的比例，0 表示不缩进，输入 0～100（不含 100）
- **双向输入**：流量与流速两个框都能填，改哪一侧，另一侧即时换算出来。
  改口径或缩进百分比时按最后编辑的那一侧重算，不会把输入冲掉
- 结果区给出流速、瞬时流量、口径与等效内径，并附截面积、换算过程与反向核对，便于复核
- 结果已展示时修改任一参数会即时刷新，无需重复点击

## 校验和计算

输入一段字节，一次算出 CRC、累加和、异或校验，省得在几个网页之间来回切：

- **两种输入方式**：十六进制 HEX 与字符串 UTF-8。
  HEX 忽略空格、逗号、分号、冒号与换行，支持 `0x` 前缀，例如 `01 03 00 00 00 0A`；
  文本模式按 UTF-8 取字节，中文一个字通常 3 字节，需与设备侧编码一致
- 三项可勾选：CRC 校验、累加和、异或校验，算哪项勾哪项
- 每组结果都给出十六进制、十进制与**校验字节**，并带一键复制

### CRC 校验

内置 60 个 CRC 预设（宽度 / 多项式 / 初值 / 输入输出反转 / 结果异或），覆盖 CRC-5 到 CRC-64；
下拉按位宽分组，页面上还有关键字搜索，算法名与常见别名都能命中：

| 预设 | 宽度 | 参数（poly / init / xorout） | 别名 / 场景 |
| --- | --- | --- | --- |
| CRC-8 | 8 | 0x07 / 0x00 / 0x00 | CRC-8/SMBUS |
| CRC-8/MAXIM | 8 | 0x31 / 0x00 / 0x00 | Dallas/Maxim 单总线、温感 |
| CRC-8/SAE-J1850 | 8 | 0x1D / 0xFF / 0xFF | 汽车总线 SAE J1850 |
| CRC-8/ROHC | 8 | 0x07 / 0xFF / 0x00 | ROHC 头压缩 |
| CRC-16/IBM | 16 | 0x8005 / 0x0000 / 0x0000 | CRC-16/ARC、CRC-16/LHA |
| CRC-16/MODBUS | 16 | 0x8005 / 0xFFFF / 0x0000 | Modbus RTU（默认预设） |
| CRC-16/USB | 16 | 0x8005 / 0xFFFF / 0xFFFF | USB 传输 |
| CRC-16/MAXIM | 16 | 0x8005 / 0x0000 / 0xFFFF | Maxim 单总线 |
| CRC-16/CCITT-FALSE | 16 | 0x1021 / 0xFFFF / 0x0000 | 最常被叫做「CCITT」 |
| CRC-16/XMODEM | 16 | 0x1021 / 0x0000 / 0x0000 | ZMODEM、ACORN |
| CRC-16/X25 | 16 | 0x1021 / 0xFFFF / 0xFFFF | X.25、HDLC |
| CRC-16/KERMIT | 16 | 0x1021 / 0x0000 / 0x0000 | CRC-16/BLUETOOTH |
| CRC-16/DNP | 16 | 0x3D65 / 0x0000 / 0xFFFF | DNP3、工业网络 |
| CRC-16/DECT | 16 | 0x0589 / 0x0000 / 0x0001 | DECT 无线 |
| CRC-16/T10-DIF | 16 | 0x8BB7 / 0x0000 / 0x0000 | SCSI DIF |
| CRC-16/EN-13757 | 16 | 0x3D65 / 0x0000 / 0xFFFF | EN 13757、M-Bus 抄表总线 |
| CRC-32 | 32 | 0x04C11DB7 / 0xFFFFFFFF / 0xFFFFFFFF | ZIP、Gzip、PNG、以太网 |
| CRC-32/BZIP2 | 32 | 0x04C11DB7 / 0xFFFFFFFF / 0xFFFFFFFF | bzip2 |
| CRC-32/MPEG-2 | 32 | 0x04C11DB7 / 0xFFFFFFFF / 0x00000000 | MPEG-2 传输流 |
| CRC-32/POSIX | 32 | 0x04C11DB7 / 0x00000000 / 0xFFFFFFFF | CRC-32/CKSUM、cksum |
| CRC-32/JAMCRC | 32 | 0x04C11DB7 / 0xFFFFFFFF / 0x00000000 | 与 CRC-32 按位取反 |
| CRC-32/XFER | 32 | 0x000000AF / 0x00000000 / 0x00000000 | XFER |
| CRC-5/USB | 5 | 0x05 / 0x1F / 0x1F | USB 令牌 |
| CRC-6/DARC | 6 | 0x19 / 0x00 / 0x00 | DARC |
| CRC-7/ROHC | 7 | 0x4F / 0x7F / 0x00 | ROHC 7 位 |
| CRC-10 | 10 | 0x233 / 0x000 / 0x000 | ATM、CRC-10/ATM |
| CRC-10/CDMA2000 | 10 | 0x3D9 / 0x3FF / 0x000 | CDMA2000 |
| CRC-11 | 11 | 0x385 / 0x01A / 0x000 | FlexRay 11 位 |
| CRC-12/UMTS | 12 | 0x80F / 0x000 / 0x000 | UMTS、CRC-12/3GPP |
| CRC-12/CDMA2000 | 12 | 0xF13 / 0xFFF / 0x000 | CDMA2000 |
| CRC-12/DECT | 12 | 0x80F / 0x000 / 0x000 | DECT 12 位 |
| CRC-13/BBC | 13 | 0x1CF5 / 0x0000 / 0x0000 | BBC |
| CRC-14/DARC | 14 | 0x0805 / 0x0000 / 0x0000 | DARC |
| CRC-15 | 15 | 0x4599 / 0x0000 / 0x0000 | CRC-15/CAN、CAN 总线 |
| CRC-15/MPT1327 | 15 | 0x6815 / 0x0000 / 0x0001 | MPT1327 |
| CRC-16/RIELLO | 16 | 0x1021 / 0xB2AA / 0x0000 | Riello 设备 |
| CRC-16/TELEDISK | 16 | 0xA097 / 0x0000 / 0x0000 | Teledisk |
| CRC-16/IBM-SDLC | 16 | 0x1021 / 0xFFFF / 0xFFFF | CRC-16/ISO-HDLC、V-41-MSB |
| CRC-24/OPENPGP | 24 | 0x864CFB / 0xB704CE / 0x000000 | OpenPGP、Radix-64 |
| CRC-24/BLE | 24 | 0x00065B / 0x555555 / 0x000000 | BLE |
| CRC-24/FLEXRAY-A | 24 | 0x5D6DCB / 0xFEDCBA / 0x000000 | FlexRay A |
| CRC-24/FLEXRAY-B | 24 | 0x5D6DCB / 0xABCDEF / 0x000000 | FlexRay B |
| CRC-24/LTE-A | 24 | 0x864CFB / 0x000000 / 0x000000 | LTE-A |
| CRC-24/LTE-B | 24 | 0x800063 / 0x000000 / 0x000000 | LTE-B |
| CRC-24/OS-9 | 24 | 0x800063 / 0xFFFFFF / 0xFFFFFF | OS-9 |
| CRC-30/CDMA | 30 | 0x2030B9C7 / 0x3FFFFFFF / 0x3FFFFFFF | CDMA |
| CRC-31/PHILIPS | 31 | 0x04C11DB7 / 0x7FFFFFFF / 0x7FFFFFFF | Philips |
| CRC-32/AUTOSAR | 32 | 0xF4ACFB13 / 0xFFFFFFFF / 0xFFFFFFFF | AUTOSAR |
| CRC-32/CD-ROM-EDC | 32 | 0x8001801B / 0x00000000 / 0x00000000 | CD-ROM EDC |
| CRC-32/MEF | 32 | 0x741B8CD7 / 0xFFFFFFFF / 0x00000000 | MEF |
| CRC-32/AIXM | 32 | 0x814141AB / 0x00000000 / 0x00000000 | AIXM |
| CRC-32/BASE91-D | 32 | 0xA833982B / 0xFFFFFFFF / 0xFFFFFFFF | BASE91-D |
| CRC-32/ISCSI | 32 | 0x1EDC6F41 / 0xFFFFFFFF / 0xFFFFFFFF | iSCSI、CRC-32C(Castagnoli) |
| CRC-64/ECMA-182 | 64 | 0x42F0E1EBA9EA3693 / 0x0000000000000000 / 0x0000000000000000 | ECMA-182 |
| CRC-64/WE | 64 | 0x42F0E1EBA9EA3693 / 0xFFFFFFFFFFFFFFFF / 0xFFFFFFFFFFFFFFFF | CRC-64/WE |
| CRC-64/XZ | 64 | 0x42F0E1EBA9EA3693 / 0xFFFFFFFFFFFFFFFF / 0xFFFFFFFFFFFFFFFF | XZ 容器 |
| CRC-64/GO-ISO | 64 | 0x000000000000001B / 0xFFFFFFFFFFFFFFFF / 0xFFFFFFFFFFFFFFFF | GO-ISO |
| CRC-64/MS | 64 | 0x259C84CBA6426349 / 0xFFFFFFFFFFFFFFFF / 0x0000000000000000 | CRC-64/MS |
| CRC-64/REDIS | 64 | 0xAD93D23594C935A9 / 0x0000000000000000 / 0x0000000000000000 | Redis |
| CRC-40/GSM | 40 | 0x0004820009 / 0x0000000000 / 0xFFFFFFFFFF | GSM |

- 多项式一律按**正常（非反转）形式**书写，反射方向由算法的输入反转参数自动决定
- 反射参数走右移、正序参数走逐位左移，结果与常见校验工具一致；
  40 / 64 位参数超出 JS 双精度整数范围，改用 BigInt 计算，避免高位被截断
- 选中预设后下方会列出完整参数与官方标准校验值（对 `123456789`），便于当场对参数表
- **校验字节**是现场最需要的东西：按该 CRC 的字节序给出低位在前 / 高位在前，
  Modbus 这类「CRC 低字节先发」的协议直接照着发即可

### 累加和校验

```
累加和 = (各字节无符号求和) & (2^宽度 − 1)
```

- 宽度可选 8 / 16 / 32 位，取低位的方式与设备一致
- 8 位即常见的一字节累加校验（求和后取低 8 位）
- 结果按所选大端 / 小端给出校验字节顺序

### 异或校验

```
异或校验 = 各字节逐位异或，再按宽度取低 N 位
```

- 宽度可选 8 / 16 / 32 位，同样支持大端 / 小端输出
- 8 位单字节 XOR 是最常见用法，多用于简单帧校验

### 核验

- CRC 覆盖全部 60 个预设，与 `crcmod` 参考实现、`zlib.crc32` 及官方「123456789」标准校验值逐一对齐
- 累加和、异或校验与逐字节手算核对，含空输入、多字节、大端 / 小端输出等用例

### 示例

Modbus 读保持寄存器帧 `01 03 00 00 00 0A`：

```
CRC-16/MODBUS = 0xCDC5      校验字节 C5 CD（低字节先发）
累加和 8 位    = 0x0E
异或 8 位      = 0x08
```
## 工具目录与通用工具

参考 [metools.info](https://www.metools.info/) 整理，`docs/tools.html` 收录该站全部 **142 个工具**，
分站长 / 开发 / 学习 / 生活 / 小工具五类。每条给出官方入口，其中 **47 条**本仓库有等效实现，
标「本地」可直接跳转，断网也能用。

本地实现按主题合并为 8 个页面，参数与结果都附代入过程便于复核：

| 页面 | 覆盖的工具 |
| --- | --- |
| `base.html` | Base64 / Base32 / Base58 / Base62 / URL 编解码、Hex、Unicode 转义、Punycode |
| `cipher.html` | 摩尔斯电码、凯撒密码、ROT13、维吉尼亚密码、栅栏密码、培根密码 |
| `hash.html` | MD5、SHA-1/256/512、8 种 CRC 模型、累加和与异或校验、Adler-32、HMAC（偏向文件与文本摘要） |
| `number.html` | 金额大写、存储单位换算、幂与开方、对数、因数分解与整除、等差等比数列、字节统计、钢管重量 |
| `color.html` | RGB / HEX / HSL / HSV / CMYK 互转，附 WCAG 对比度 |
| `random.html` | 密码生成、随机数、随机点名、MAC 地址（随机源为 `crypto.getRandomValues`） |
| `net.html` | IPv4 子网划分、MAC 地址解析 |
| `date.html` | 年龄计算、日期间隔、ISO 周号、时间戳互转 |

要点：

- **目录可搜索可筛选**：支持按名称/说明搜索，可切分类，也可只筛「有本地实现」的条目
- **与已有页面的分工**：CRC / 累加和 / 异或这三类清单项指向本仓库已有的 `checksum.html`，
  它按通信协议给预设、宽度与大小端、校验字节，比 `hash.html` 更贴实际组帧；
  `hash.html` 则偏向文件与文本摘要（MD5、SHA、HMAC、Adler-32）
- **依赖外部服务的条目只给链接**：图片压缩、二维码生成识别、SSL 证书校验、端口扫描、短链、
  敏感词检测等需要服务端或第三方库，与「零依赖单文件」冲突，故不本地复刻
- 本地页与 metools 的计算口径若有差异，以本地页说明为准
- `docs/tools.html` 由 `tools/gen_tools_page.py` 生成，数据在 `tools/catalog.json`（一次性抓取结果），
  本地映射在 `tools/local_pages.json`；改完映射重跑脚本即可

### 校验

`tools/check_algos.mjs` 把各工具页的核心算法摘出来与标准测试向量逐条比对，
改完算法跑一遍：

```bash
node tools/check_algos.mjs
# 105 通过, 0 失败
```

覆盖的向量：

- MD5、SHA-1/256/512 对 RFC 测试向量（`abc`、空串、长输入、中文）
- CRC 对 CRC RevEng 目录（`123456789` 在 8 种模型下的标准值）
- Base32/Base58/Base62 对 RFC 4648 与比特币地址样例；Punycode 对 RFC 3492（`中国` → `fiqs8s`、`münchen`）
- 金额大写覆盖零、整、角、分、负数与跨节补零等边界
- HMAC-SHA1/256/512 与 Node `crypto` 对照
- 日期对 ISO 8601 周号边界（如 2021-01-01 属 2020 年第 53 周）
- 子网掩码连续性、MAC 单播/组播位、WCAG 黑白对比度 21:1

## 文件 / 文本 MD5 校验

`docs/md5.html` 单独一页专门算摘要，文本和文件都能算：

- **三种输入**：文本（UTF-8）、十六进制 HEX、文件上传
- **文件支持多选与拖拽**，逐个给出摘要；文件不离开本机，全程在浏览器里算
- **流式分块计算**：文件按 4 MB 分块读取，MD5 逐块累加，大文件不会一次性读进内存
- **单文件上限 50 MB**：超过上限的文件直接拦下、不参与计算，列表里标成「超出大小上限，未计算」，
  其余文件照常算，不会因为一个超限文件让整批失败
- 算法多选：MD5 / SHA-1 / SHA-256 / SHA-512，勾几个出几个

MD5 是页内实现（浏览器原生 `crypto.subtle` 不支持 MD5），
SHA 系列走原生 `crypto.subtle`，因此 SHA 需要 https 或 localhost 环境；
本地用 `file://` 直接打开时 SHA 会提示「当前环境不支持」，MD5 不受影响。

### 为什么文件要分块

一次 `file.arrayBuffer()` 读 50 MB，在中低端手机上很容易触发内存抖动甚至崩页。
分块读入后逐块喂给 MD5 状态机，页面的内存占用与文件大小无关，只与块大小有关。

### 核验

- MD5 与 `md5sum` / `hashlib` / `node:crypto` 在空文件、`abc`、中文、5 MB 随机数据上逐一对齐
- 随机切分成不同大小的块与整块一次算，结果一致（验证状态机可续算）
- SHA-1 / SHA-256 / SHA-512 与系统 `sha1sum` / `sha256sum` / `sha512sum` 一致

## 使用

页面是零依赖的单文件，直接用浏览器打开 `docs/index.html` 进入工具入口页，
再点击进入各计算页；`docs/tools.html` 是工具总目录。也可以直接打开任意页面，
或通过静态托管发布（如仓库 Pages / 云原生构建）。

通用工具页共用 `docs/app.css` 与 `docs/app.js`，是本次为减少重复而抽出的一份公共样式与工具函数
（取元素、格式化、复制、页签）。其余计算页（`calibration` / `gold` / `flow` / `checksum` / `md5`）
仍是各自独立的单文件，不受影响。

本地预览：

```bash
python3 -m http.server 8899 --directory docs
# 入口页   http://127.0.0.1:8899/index.html
# 工具目录 http://127.0.0.1:8899/tools.html
# 校准页   http://127.0.0.1:8899/calibration.html
# 黄金页   http://127.0.0.1:8899/gold.html
# 流量页   http://127.0.0.1:8899/flow.html
# 校验页   http://127.0.0.1:8899/checksum.html
# 通用工具 http://127.0.0.1:8899/base.html（同理 base/hash/cipher/number/color/random/net/date）
#          http://127.0.0.1:8899/hash.html
# MD5 页   http://127.0.0.1:8899/md5.html
```

### 示例

零点 `0.02`，流量点 `0.1` 误差 `+2%`：

```
0.1016 = 0.1 + (0.1 − 0.02) / 100 × 2
```

黄金换算，金价 `2650` 美元/盎司、汇率 `6.7195`（页面自动获取）：

```
572.5 元/克 = 2650 × 6.7195 ÷ 31.1034768
```

流量流速换算，口径 `DN80`、缩进 `0%`、流量 `100` m³/h：

```
5.5265 m/s = 100 ÷ 3600 ÷ (π × 0.08² ÷ 4)
```

校验和计算，Modbus 帧 `01 03 00 00 00 0A`：

```
CRC-16/MODBUS = 0xCDC5，校验字节 C5 CD（低字节先发）
CRC-64/XZ      = 0x995DC9BBDF1939FA（对标准串 "123456789"）
```

## 结构

- `docs/index.html` — 工具入口页，列计量工具与通用工具入口（HTML + CSS 单文件，无外部依赖、无 JS）
- `docs/tools.html` — 工具目录页（HTML + CSS + 少量 JS 单文件，用于搜索与筛选）
- `docs/app.css`、`docs/app.js` — 通用工具页共用样式与工具函数（八页共用，避免各写一份）
- `tools/gen_catalog.py` — 从 metools.info 抓取工具清单，产出 `tools/catalog.json`
- `tools/gen_tools_page.py` — 由 catalog 与本地映射渲染出 `docs/tools.html`
- `tools/check_algos.mjs` — 各工具页核心算法的测试向量校验
- `docs/calibration.html` — 电磁水表流量点校准计算页（HTML + CSS + JS 单文件，无外部依赖）
- `docs/gold.html` — 黄金价格换算与斐波那契回调计算页（HTML + CSS + JS 单文件，除汇率自动获取外无外部依赖）
- `docs/flow.html` — 瞬时流量与流速换算页（HTML + CSS + JS 单文件，无外部依赖）
- `docs/checksum.html` — 校验和计算页（HTML + CSS + JS 单文件，无外部依赖）
- `docs/md5.html` — 文件 / 文本 MD5 校验页（HTML + CSS + JS 单文件，SHA 系列调用浏览器原生 crypto，无外部依赖）
- `docs/base.html` / `cipher.html` / `hash.html` / `number.html` / `color.html` / `random.html` / `net.html` / `date.html`
  — 通用工具页（HTML + CSS + JS，依赖同目录的 `app.css` / `app.js`，无其它外部依赖）
