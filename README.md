# 🌿 GreenWall

> GitHub 贡献图绿墙工具，基于 Cloudflare Worker + GitHub Actions

自动填充 GitHub Contribution 贡献图，让你的绿墙更丰富！

## ✨ 功能

- 🎨 **涂抹模式**：像素画布手动涂抹，精确控制每一格颜色深浅
- 📅 **仅今天**：快速刷新今天的贡献
- 📆 **日期范围**：批量填充指定日期段
- 🎲 **随机模式**：随机分布提交，更自然
- 🍪 **Cookie 记忆**：配置信息本地保存，无需重复填写
- 🔐 **授权码模式**：站长专属，Token 永不暴露在前端

## 📁 仓库结构

```
GreenWall/
├── .github/
│   └── workflows/
│       └── auto.yml        # GitHub Actions 工作流
├── auto.py                 # 提交脚本
├── pr.py                   # 像素渲染脚本
├── log.txt                 # 提交记录
├── worker.js               # Cloudflare Worker 完整代码
└── README.md
```

## 🚀 部署方法

### 第一步：Fork 仓库

点击右上角 `Fork`，在自己的账号下创建一份仓库副本。

### 第二步：开启 Actions 写入权限

进入你 Fork 的仓库：

```
Settings → Actions → General → Workflow permissions
→ 选择 Read and write permissions → Save
```

### 第三步：创建 GitHub Token

1. 打开：`GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)`
2. 点击 `Generate new token (classic)`
3. 勾选权限：`repo` + `workflow`
4. 生成后复制保存（只显示一次）

### 第四步：部署 Cloudflare Worker

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 左侧菜单 → `Workers & Pages` → `Create application` → `Create Worker`
3. 起个名字（如 `green-wall`），创建完成后进入编辑器
4. 删除默认代码，粘贴本仓库 `worker.js` 的全部内容
5. 点击 `Save and deploy`

### 第五步：创建并绑定 KV

1. 左侧菜单 → `Workers KV` → `Create namespace`，名称随意（如 `greenwall-kv`）
2. 回到 Worker → `Settings → Bindings → KV Namespace`
3. 点击 `Add binding`：
   - Variable name：`GW_KV`
   - Namespace：选刚才创建的命名空间
4. 保存

### 第六步：配置管理后台

打开：`https://你的Worker域名/admin`

首次访问设置管理密码，然后填写：

| 字段 | 说明 |
|------|------|
| GitHub 用户名 | 你的 GitHub 用户名 |
| 仓库名 | Fork 后的仓库名，默认 `GreenWall` |
| Workflow 文件名 | `auto.yml` |
| 分支名 | `main` |
| GitHub Token | 第三步生成的 PAT |
| 授权码 | 可选，设置后可在主页使用授权码模式 |

点击「保存配置」完成。

---

## 👤 用户使用方法（配置模式）

1. Fork 本仓库并开启 Actions 写入权限（同上）
2. 生成自己的 GitHub Token（同上）
3. 打开站长部署的页面（Worker 域名）
4. 在右侧「配置 & 参数」填写：
   - GitHub Token
   - GitHub 用户名
   - 仓库名（自己 Fork 的，默认 `GreenWall`）
   - Workflow 文件名：`auto.yml`
5. 点击「保存到 Cookie」
6. 在左侧画布涂抹图案，选择模式参数
7. 点击「推送到 GitHub Actions」
8. 等待 1–2 分钟，打开 GitHub Profile 查看贡献图

> Token 仅保存在你自己浏览器的 Cookie 中，不会上传到服务端。

---

## 📝 参数说明

| 模式 | 说明 |
|------|------|
| 涂抹模式 | 画布手动涂抹，0 = 不提交，1–4 = 提交次数（颜色深浅） |
| 仅今天 | 只刷今天的贡献 |
| 日期范围 | 指定起止日期，每天均匀提交，可跳过周末 |
| 随机模式 | 日期范围内随机提交 0 到上限次数，更自然 |

> 强度上限建议设为 4，对应贡献图最深色。

---

## 🛠 技术栈

- **Cloudflare Worker** — 无服务器后端，处理前端请求和鉴权
- **Cloudflare KV** — 存储管理员配置、Token、授权码
- **GitHub Actions** — 执行实际的 git commit 操作
- **Python** — 生成带历史时间戳的提交记录

## 📄 License

MIT License © 2026 ZSFan
