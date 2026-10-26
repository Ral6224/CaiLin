# 材林——素材之森林

> 把值得写的人，留在纸上。

**材林**是一个由 Node.js 驱动的语文作文素材管理网页。它把人物、事迹、语录、精神、适用话题与关键词集中归档，方便在写作前检索、阅读和取用。

项目采用纸本档案风格的界面，提供浅色与深色两套配色。没有动画特效，没有 emoji，也没有数据库和第三方运行时依赖。所有素材保存在本机的一个 JSON 文件中，备份则打包成 zip。

## 功能

- 博客式素材编辑器：人物标题、身份、正文、语录、出处、精神品质、话题与关键词
- 正文支持 Markdown，可在编写与预览之间切换
- 工具栏支持标题、粗体、斜体、引用、有序列表、无序列表、链接和分隔线
- 快捷键：Ctrl+B 粗体、Ctrl+I 斜体、Ctrl+S 保存
- 新增、编辑、删除素材，删除需要二次确认
- 按话题、人物筛选
- 全文搜索人物、身份、事迹、语录、出处、精神、话题与关键词
- 按最近更新或人物姓名排序
- 浅色 / 深色主题，首次访问跟随系统，手动选择会记住
- 数据管理页：备份、下载、恢复、删除、导入、恢复初始设置
- 桌面端与移动端自适应布局
- 内置 8 则模板素材，可随时恢复

## 技术栈

| 部分 | 实现 |
| --- | --- |
| 服务端 | Node.js 18+，仅使用内置模块 |
| 数据存储 | JSON 文件，原子写入 |
| 前端 | 原生 HTML、CSS、JavaScript |
| ZIP | 基于 Node.js zlib 自行实现的读写模块 |
| 上传解析 | 自行实现的 multipart/form-data 解析 |
| 部署 | 直接运行 Node.js，或使用 Debian 启动脚本 |

项目没有 npm 依赖，不需要执行 npm install，也不需要构建步骤。

## 快速开始

环境要求：Node.js 18 或更高版本。

~~~bash
cd 语文素材
node server.js
~~~

Windows 也可以直接双击 start.bat，或在命令提示符中运行：

~~~bat
start.bat
~~~

start.bat 默认监听 127.0.0.1:9850；关闭窗口或按 Ctrl+C 即可停止。

启动后打开：

~~~text
http://127.0.0.1:9850
~~~

首次启动会在 data 目录生成 materials.json，并写入 8 则内置模板素材。

也可以使用 npm 脚本：

~~~bash
npm start
~~~

开发时自动重启：

~~~bash
node --watch server.js
~~~

### 修改端口

~~~powershell
$env:PORT=9860; node server.js
~~~

或在 Debian 上：

~~~bash
PORT=9860 HOST=127.0.0.1 node server.js
~~~

默认端口为 9850。直接执行 node server.js 或使用 start.bat 时监听 127.0.0.1；使用 start.sh 启动时默认监听 0.0.0.0。

## 素材编辑

点击右上角“新增素材”进入编辑器。人物为必填项；事迹、语录、精神品质至少填写一项。

| 字段 | 说明 |
| --- | --- |
| 人物 | 必填，素材的人物姓名 |
| 身份 | 人物身份、时代或职业背景 |
| 事迹 | 素材正文，支持 Markdown |
| 语录 | 可直接引用的原话，可多行 |
| 语录出处 | 作品名、篇名或语境 |
| 精神 | 人物最值得书写的精神内核 |
| 话题 | 适用作文话题，可多个 |
| 关键词 | 检索用关键词，可多个 |

正文支持标题、粗体、斜体、引用、有序与无序列表、链接、分隔线和代码块。原始 HTML 会被转义，不会被当作页面代码执行；不安全的链接协议也会被拒绝。

## 数据管理

点击右上角的“数据”进入数据管理页：

~~~text
http://127.0.0.1:9850/data.html
~~~

### 备份

点击“立即备份”，系统会把当前全部素材、备份格式和当前主题打包成一个 zip，写入项目的 backup 文件夹，并立即显示在备份列表中。

备份文件可以：

- 下载到本机
- 覆盖恢复当前素材
- 从服务器删除

文件名形如：

~~~text
cailin-backup-20261026-204829.zip
~~~

同一秒内重复备份时，会自动追加序号，例如 cailin-backup-20261026-204829-2.zip。

每个备份包含三个文件：

| 文件 | 内容 |
| --- | --- |
| materials.json | 全部素材 |
| settings.json | 主题与生成信息 |
| manifest.json | 备份格式、生成时间和素材数量 |

备份文件只保存在服务器本机，不会上传网络。删除备份只删除 zip，不影响当前素材。

### 导入

“导入备份”用于上传之前生成的 zip，单个文件最大 24 MB。

导入流程：

1. 选择 zip 文件。
2. 确认是否用备份覆盖当前素材。
3. 服务器读取备份，并检查是否有素材与当前素材完全相同。
4. 如果存在重复素材，会再次询问：
   - 合并导入：保留当前素材，只加入与当前不一致的内容，完全相同的素材跳过。
   - 仍然覆盖：清空当前素材，全部使用备份中的内容。
5. 没有重复素材时，确认后直接覆盖导入。

导入或恢复时会同时恢复备份中记录的主题。

### 恢复初始设置

点击“全部恢复初始设置”并再次确认后：

- 当前所有素材会被清空
- 重新写入源代码中的 8 则内置模板素材
- 已生成的备份文件不会被删除
- 当前主题不会改变

## 数据存储

素材保存在：

~~~text
data/materials.json
~~~

写入时先写临时文件，再原子重命名，避免进程中断留下半个 JSON。多个修改请求会串行执行，降低并发覆盖的风险。

备份保存在：

~~~text
backup/
~~~

该目录在服务启动时自动创建。运行服务的用户需要对 data 和 backup 目录有读写权限。

## Debian 服务器部署

把项目目录上传到服务器，安装 Node.js 18 或更高版本，然后执行：

~~~bash
cd 语文素材
chmod +x start.sh
./start.sh start
~~~

默认监听 0.0.0.0:9850。启动日志写入 logs/server.log，PID 文件写入 run/server.pid。

常用命令：

~~~bash
./start.sh start      # 启动
./start.sh status     # 查看状态
./start.sh logs       # 跟踪日志
./start.sh restart    # 重启
./start.sh stop       # 停止
./start.sh fg         # 前台运行，适合交给 systemd
~~~

开放防火墙端口：

~~~bash
sudo ufw allow 9850/tcp
~~~

自定义端口或监听地址：

~~~bash
PORT=9860 HOST=127.0.0.1 ./start.sh start
~~~

## API

除文件上传接口外，请求与响应均为 JSON。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | /api/health | 健康检查 |
| GET | /api/materials | 获取全部素材与筛选统计 |
| GET | /api/materials/:id | 获取单则素材 |
| POST | /api/materials | 新增素材 |
| PUT | /api/materials/:id | 更新素材 |
| DELETE | /api/materials/:id | 删除素材 |
| GET | /api/backups | 备份列表与当前统计 |
| POST | /api/backups | 生成备份 |
| GET | /api/backups/:name/download | 下载备份 |
| POST | /api/backups/:name/restore | 恢复备份 |
| DELETE | /api/backups/:name | 删除备份 |
| POST | /api/reset | 恢复内置模板 |
| POST | /api/import/preview | 上传并预检备份 |
| POST | /api/import/commit | 按合并或覆盖方式导入 |
| DELETE | /api/import/preview/:token | 取消待导入备份 |

GET /api/materials 支持 q、topic、person 三个查询参数。

生成备份的请求体示例：

~~~json
{
  "theme": "dark"
}
~~~

恢复备份和恢复初始设置需要显式确认：

~~~json
{
  "confirm": true
}
~~~

## 目录结构

~~~text
.
├─ server.js            HTTP 服务、静态文件与 API
├─ lib/
│  ├─ store.js          数据校验、读写、内置模板与合并逻辑
│  ├─ zip.js            ZIP 打包与解包
│  └─ multipart.js      上传表单解析
├─ public/
│  ├─ index.html        素材库页面
│  ├─ data.html         数据管理页面
│  ├─ styles.css        浅色与深色主题
│  ├─ theme.js          首屏主题初始化
│  ├─ theme-ui.js       主题切换按钮
│  ├─ app.js            编辑、搜索、筛选与详情
│  ├─ data.js           备份、导入与恢复交互
│  └─ favicon.svg       站点图标
├─ data/
│  └─ materials.json    本地素材数据
├─ backup/              备份 zip
├─ start.sh             Debian/Linux 进程管理脚本
├─ start.bat            Windows 启动脚本
├─ package.json
└─ README.md
~~~

## 安全说明

项目默认没有登录鉴权，数据管理页也沿用同一套访问控制。适合本地或受信任的内网使用。

如果需要暴露到公网，建议在前面增加一层带 HTTPS 和访问控制的反向代理，并限制 data、backup 目录的服务器文件权限。

上传的 zip 会经过文件大小、压缩方式、路径、CRC 和素材字段校验。单个上传最大 24 MB，解压后总大小限制为 32 MB。不支持加密 ZIP、分卷 ZIP 和 ZIP64。

## 常见问题

### 端口已被占用

修改端口后重新启动：

~~~powershell
$env:PORT=9861; node server.js
~~~

### 页面显示素材读取失败

确认 Node.js 进程仍在运行，并检查终端或 logs/server.log 中的错误信息。

### 备份列表为空

备份文件保存在 backup 目录。首次需要先在数据管理页点击“立即备份”。

### 导入时提示备份无效

确认上传的是本项目生成的 zip，且压缩包根目录包含 materials.json。ZIP 不能加密，也不能是分卷或 ZIP64 格式。

### 如何迁移到另一台机器

在旧机器上生成备份并下载 zip；在新机器上启动服务，进入数据管理页，点击“导入备份”上传该 zip。
