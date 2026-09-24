# 分支策略

MOE FIGHTERS 用简化 GitFlow：日常工作在 `develop` 集成，`main` 只收已验收的版本与紧急修复。

## 长期分支

| 分支 | 职责 |
| --- | --- |
| `main` | 稳定基线。只接受发布与 hotfix。每个发布点打 tag `vX.Y.Z`。 |
| `develop` | 集成与联调。功能与日常修复先合到这里。 |

不要直接在 `main` 上开发。

## 短期分支

| 命名 | 从哪切 | 合到哪 | 用途 |
| --- | --- | --- | --- |
| `feature/<名字>` | `develop` | `develop` | 新功能 |
| `fix/<名字>` | `develop` | `develop` | 非紧急修复 |
| `hotfix/<名字>` | `main` | `main`，再回并进 `develop` | 线上事故专用 |

合并后删除短期分支。

## PR 检查

1. 基分支选对（feature / fix → `develop`，hotfix → `main`）。
2. `npm run check` 与 `npm run build` 通过（CI 会在 PR 上跑这两项）。
3. Hotfix 只带修复，不搭车做功能。

## 常规发布（`develop` → `main`）

把联调通过的**同一个 commit SHA** 快进到 `main` 并打 tag：

```bash
git checkout main
git merge --ff-only <验收通过的 SHA>
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin main vX.Y.Z
```

## Hotfix（`main` → `hotfix/*` → `main` → `develop`）

```bash
git checkout -b hotfix/<名字> main
# ... 最小修复，跑 npm run check 与 npm run build ...
git checkout main
git merge --no-ff hotfix/<名字>
git tag -a vX.Y.Z -m "vX.Y.Z"
git checkout develop
git merge --no-ff main
```

## 分支保护

仓库公开后建议打开：禁止直接 push `main` / `develop`，要求 PR 检查通过，至少一人 review。
