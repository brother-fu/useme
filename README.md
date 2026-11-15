# useme · 在哪刷哪张卡

一个纯静态网页。勾选你有哪些信用卡，再选你在哪消费（比如 Costco），它会按返现率给你的卡排序，并写明理由。

- **不存卡号**：只记录发卡行和卡名，状态存在浏览器 localStorage 里。
- **处理商家限制**：比如 Costco 门店只收 Visa。
- **季度轮换卡**：Freedom Flex、Discover it 按当前季度的类别计算，并考虑激活状态和额度上限。
- **自选类别卡**：Custom Cash、Cash+、BofA Customized Cash 按你选的类别计算。
- **积分卡**：按你设的"每分几美分"折算成等效返现率。

## 数据文件

| 文件 | 内容 | 更新频率 |
| --- | --- | --- |
| `data/cards.json` | 发卡行、卡片、固定返现规则 | 卡片改版时 |
| `data/merchants.json` | 消费类别、商家 → 类别、收卡限制 | 偶尔 |
| `data/rotating.json` | 季度轮换 5% 类别 | **每季度** |

每季度发卡行公布新类别后，更新 `data/rotating.json` 并 push，网页就会自动用上新数据。用户也可以在「我的卡包 → 设置」里手动勾选本季类别，覆盖默认值。

## 本地运行

```sh
python3 -m http.server 8000
# 打开 http://localhost:8000
```
