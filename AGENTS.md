# Agent Notes

碰到子系统再读守卫它的文档。细节在文档里，本文件只做触发地图。不要一上来把 `docs/` 读完。

## 热路径（几乎每次相关，直接遵守）

- 改用户看得见的界面（`index.html`、`src/style.css`、`src/ui/**`、`src/render/**`）→ 先读 `docs/AGENT_DEV_CONSTRAINTS.GENERIC.md` §4。用户没说「打开浏览器 / 帮我看效果 / 浏览器里验一下」，不要启动浏览器、不要截图、不要点页面。改完写下入口和怎么复现，交给用户目视。

## 低频子域（命中才读）

| 触碰 | 先读 | 附带测试 |
|---|---|---|
| 新角色、精灵表、图生图提示词 | `docs/new-character-sop.md` | `npm run check` |
| 安全排查、密钥泄露、准备公开仓库 | `docs/SECURITY_AUDIT.md` | 文档内扫描命令 + `npm run check` |

## 通用

用户没要求就不要 commit、不要 push。战斗或选人逻辑改完跑 `npm run check`。

文档默认不进 git：`docs/` 只有 `docs/public/` 可公开，其余一律留本地。新文档先放本地，明确可公开才移入 `docs/public/`；公开文件不引用本地文档。
