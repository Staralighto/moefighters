# Agent Notes

碰到子系统再读守卫它的文档。细节在文档里，本文件只做触发地图。不要一上来把 `docs/` 读完。

## 热路径（几乎每次相关，直接遵守）

- 改用户看得见的界面（`index.html`、`src/style.css`、`src/ui/**`、`src/render/**`）→ 先读 `docs/AGENT_DEV_CONSTRAINTS.GENERIC.md` §4。用户没说「打开浏览器 / 帮我看效果 / 浏览器里验一下」，不要启动浏览器、不要截图、不要点页面。改完写下入口和怎么复现，交给用户目视。
- 改触屏判定、媒体查询、视口单位（dvh/cqw）、宽屏或横屏适配 → 先读 `docs/device-adaptation.md`。能力判定只住在 `src/ui/device.ts`，改完跑 `npm run check`（里面有源码锁）。
- 改后台页 / 弹窗的开合动效、加载提示，或新增后台页 → 先读 `docs/motion-and-loading.md`。只许快速渐入渐出，状态不等动画事件；「减少动态效果」只从 `ui/motion.ts` 读。大厅模式验证用开发工具 `window.__mf`。
- 颜色只写暗色。会随主题变的颜色进 `src/style.css` 顶部 `:root` 当 token，亮色由 `src/theme/palette.ts` 推导（规则在它的文件头），不要手写亮色规则。强调色当填充用 `var(--p1)`，当文字、描边、选中圈用 `var(--p1-ink)`。画在美术上的容器挂 `data-scheme="dark"`，亮色下保持暗色。`npm run check` 会拦写死的中性色和裸用的强调色。
- 设置弹窗不写说明，只留控件名和选项名。`#settings-dialog` 的可见文字由 `npm run check` 锁死，不要加段落、副文案或提示。
- 改削防（格挡伤害）或新增多段大招 → 先读 `docs/public/moves.md` 的「削防」节。多段招必须写 `guardPlan` 并用 `withGuard` 在交付点落值；抓取和 `noBlock` 保持不可挡。
- 写角色 sprite 图生图提示词（含新角色、重制和补帧）→ 先按用户目标确定素材和范围，再读取 [精灵表指南](docs/public/new-character-sop.md)或 `docs/sprite-remake-sop.md` 的对应模板。新角色基础内容完成后，集中交付三张基础表及用户要求的附加素材提示词。用户明确要求优先于默认流程，保持输出与目标表格的格位对应。
- 在 Codex 内给角色生成 sprite（生图、补帧、去绿、归格、收尾和启用）→ 每项请求在开头用一条消息复述本次要做的事。按 `docs/sprite-remake-sop.md` 执行，内部检查清单无需逐项发消息。实际提交前集中贴出完整提示词和参考图顺序。绿底去绿前禁止缩放。

## 低频子域（命中才读）

| 触碰 | 先读 | 附带测试 |
|---|---|---|
| 重制 sprite、重制精灵表、对齐脚线、归格；sprite 工作包「收尾 / 启用」 | `docs/sprite-remake-sop.md`；动作表对齐统一走 `npm run sprite:align` | 启用时 `npm run check` |
| 新角色、色块占位图 | `docs/new-character-sop.md` | `npm run check` |
| 角色头像、血条旁头像 | `docs/avatar-sop.md` | 无 |
| 全身立绘入库、换图、脸的位置（必杀快切 / 开打过场） | `docs/portraits.md` | `npm run portraits -- --check` |
| 手机键位方案（基础 / 进阶）、自定义布局编辑器、设置页签、暂停菜单 | `docs/controls-plan.md` | `npm run check` |
| 招式、受击、buff、弹道 | `docs/public/moves.md` | `npm run check` |
| 安全排查、密钥泄露、准备公开仓库 | `docs/SECURITY_AUDIT.md` | 文档内扫描命令 + `npm run check` |
| 构建或上传 Bilibili Toy 包 | `docs/toy-release.md` | 文档内的路径核对 + `npm run check` |
| 联机信令、CloudBase、TURN、房间匹配 | `docs/online-security.md` | `node cloudbase/functions/mailbox/local.js --check` + `npm run check` |
| EdgeOne、加速区域、自定义域名、国内节点或首屏延迟 | `docs/edgeone.md` | 无 |

## 通用

- 安全、性能或仓库清洁排查先看本地 `docs/SECURITY_AUDIT.md` 的「已接受的开发取舍」，跳过其中的四项。

用户没要求就不要 commit、不要 push。战斗或选人逻辑改完跑 `npm run check`。

文档默认不进 git：`docs/` 只有 `docs/public/` 可公开，其余一律留本地。新文档先放本地，明确可公开才移入 `docs/public/`；公开文件不引用本地文档。
