# UT Bot 值守（影子引擎）

[![watch](https://github.com/yuf22300-lmyfy/utbot-watch/actions/workflows/watch.yml/badge.svg)](https://github.com/yuf22300-lmyfy/utbot-watch/actions/workflows/watch.yml)

GitHub Actions **每 5 分钟**重算一次 UT Bot 信号，与 TradingView + OKX 策略机器人并行运行的**第二引擎**。
**影子模式：只计算、只留档，绝不下单。**

## 怎么看

| 文件 | 内容 |
|---|---|
| [state.json](state.json) | 当前方向、自何时、信号价 |
| [flips.md](flips.md) | 每次翻转追加一行（北京时间、方向、价格、对账备注） |
| Actions 页签 / 上方徽章 | 引擎心跳（绿=活着） |

## 信号参数（与实盘一致）

- ETH-USDT-SWAP · 15m · **key=50 · ATR=10**（Wilder）
- Pine v4 停止线递归，只用已收盘K线，信号在K线收盘时刻生效
- 每次运行从约 130 天K线历史**全量重算**——漏跑/延迟只会让信号晚到，不会算错或漏掉

## 已完成的对账

- 2026-09-15 23:00（北京）翻空：本引擎 = TV 警报 = OKX 策略「eth utbot final」执行，三方小时级一致，信号价 2408.13
- 本地 5 年回测指纹：66 笔 / 胜率 45.5% / 1x 复利 +1306%（与主引擎逐笔一致）

## 切换预案（影子 → 接管执行）

影子引擎与 TV/OKX 在**下一次翻转**再次一致后，即可考虑接管执行权（退 TV 会员、改用带交易权限的 API Key 下单）。在此之前本仓库不持有任何密钥。
