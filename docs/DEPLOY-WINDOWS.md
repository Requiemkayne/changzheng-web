# Windows 内网部署手册（长征 web）

面向把「长征」网页版部署到 **Windows 内网服务器** 的运维/开发同学。覆盖：快速启动、常驻服务、反向代理、环境变量、备份恢复、升级、排障、安全清单。

> 定位（已定，不要推翻）：本项目只做本地开发 + 将来接内网服务器，**不做 GitHub Pages**。
> 纯静态托管只是演示（判分在浏览器、题库公开），**正式考试/竞赛必须走后端 `server/server.js`**。
> 静态模式 = 游客体验：无账号、进度存 localStorage、答案随静态文件公开。

> 文中行号以当前工作树为准；多个批次并行改动时行号可能后移，以函数名/代码块描述为准。

**标记说明**

- ✅ 已实测：2026-10-21，本机 Windows 11 + Node v22.14.0，仓库提交 `153cf33`
- ⚠️ 未验证：需要真内网服务器 / 管理员权限 / 本机未安装的组件（nssm、nginx、IIS、防火墙配置）

---

## 1. 一页式快速启动

### 1.1 前置条件

| 项 | 要求 |
|---|---|
| 操作系统 | Windows 10 / 11 或 Windows Server 2016+（x64） |
| Node.js | **22.5 及以上**（后端用 `node:sqlite`；实测 v22.14.0） |
| 端口 | 默认 8088，需未被占用 |
| 目录 | 本手册用 `C:\cz\web` 作为仓库目录，`C:\cz\logs` 存日志 |

### 1.2 取代码与版本校验

```bat
cd /d C:\cz
git clone https://github.com/Requiemkayne/changzheng-web.git web
cd /d C:\cz\web
node -v
node -e "require('node:sqlite');console.log('node:sqlite OK')"
```

预期输出（node 两条 ✅ 实测）：

```text
v22.14.0
node:sqlite OK
(node:12345) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
```

- `ExperimentalWarning` 是 Node 22 对内置 SQLite 的正常提示，**不是错误**，不要为此降级 Node。
- 如果第二条报 `Cannot find module 'node:sqlite'`，说明 Node 低于 22.5，升级 Node 即可。
- `git clone` 一条 ⚠️ 未验证：需要仓库访问权限（本机已有工作树，未重复克隆）。

### 1.3 首次启动

```bat
cd /d C:\cz\web
node server\server.js
```

实测启动输出（PID 与临时库路径已替换为占位）：

```text
题库导入: 新增 24 题 / 跳过重复 0 题 / 库内共 24 题
(node:12345) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
长征后端已启动: http://localhost:8088（实际监听 0.0.0.0:8088）
局域网访问: http://<本机IP>:8088 （手机同一 WiFi）
数据库: <DB_PATH 解析后的绝对路径>
```

首次启动会自动建库（默认 `server\data.db`，见 `server\db.js:12`）、导入 `server/question-bank.json` 题库。
控制台里按 `Ctrl+C` 会走优雅关库（`server\server.js:573-574` 监听 SIGINT）；直接关窗口则依赖 SQLite WAL 保证一致性。

### 1.4 健康检查

另开一个命令提示符：

```bat
curl http://127.0.0.1:8088/api/health
curl -s -o NUL -w "%{http_code}\n" http://127.0.0.1:8088/
curl -s -o NUL -w "%{http_code}\n" http://127.0.0.1:8088/api/nodes
```

实测输出：

```text
{"ok":true,"time":1792574786220}
200
200
```

> 注意：本服务的 HEAD 请求返回 **405**（`scripts/test-api.js` 有断言），所以冒烟请用上面的 `GET` 取状态码，**不要用 `curl -I`**。

### 1.5 内网访问地址

```bat
ipconfig
```

找到以太网/WLAN 的 IPv4 地址（示例 `192.168.1.9`），其它内网机器访问：

```text
http://192.168.1.9:8088/
```

只想对内网网卡开放（不监听所有网卡）：

```bat
set HOST=192.168.1.9
set PORT=8088
node server\server.js
```

`HOST` 只影响绑定地址；绑定到具体 IP 后，本机用 `http://127.0.0.1:8088` 会连不上，改用该 IP 访问。✅ 实测绑定逻辑（`server/server.js:28`、`639`）。

---

## 2. 常驻服务（开机自启）

### 2.1 方案 A：nssm 注册 Windows 服务（推荐）

1. 下载 nssm 2.24（x64），解压出 `nssm.exe` 放到 `C:\cz\tools\nssm.exe`。
2. 以**管理员**身份打开命令提示符，执行：

```bat
mkdir C:\cz\logs
C:\cz\tools\nssm.exe install ChangzhengWeb "C:\Program Files\nodejs\node.exe"
C:\cz\tools\nssm.exe set ChangzhengWeb AppDirectory C:\cz\web
C:\cz\tools\nssm.exe set ChangzhengWeb AppParameters "server\server.js"
C:\cz\tools\nssm.exe set ChangzhengWeb AppStdout C:\cz\logs\web.out.log
C:\cz\tools\nssm.exe set ChangzhengWeb AppStderr C:\cz\logs\web.err.log
C:\cz\tools\nssm.exe set ChangzhengWeb AppEnvironmentExtra PORT=8088 DB_PATH=C:\cz\web\server\data.db HOST=0.0.0.0
C:\cz\tools\nssm.exe set ChangzhengWeb AppRotateFiles 1
C:\cz\tools\nssm.exe set ChangzhengWeb AppRotateBytes 10485760
C:\cz\tools\nssm.exe set ChangzhengWeb AppStopMethodConsole 15000
C:\cz\tools\nssm.exe set ChangzhengWeb Start SERVICE_AUTO_START
C:\cz\tools\nssm.exe start ChangzhengWeb
C:\cz\tools\nssm.exe status ChangzhengWeb
```

3. 用 `C:\cz\tools\nssm.exe edit ChangzhengWeb` 打开 GUI，逐项核对：

- **Application**：`C:\Program Files\nodejs\node.exe`；**Startup directory**：`C:\cz\web`
- **Arguments**：`server\server.js`
- **I/O**：stdout / stderr 指向 `C:\cz\logs` 下的两个文件
- **Environment**：`PORT` / `DB_PATH` / `HOST`（相当于启动前 `set`）
- **Exit actions**：默认 Restart（崩溃自动拉起）
- **Startup type**：Automatic；**Log on**：LocalSystem 或专用低权限账号（该账号必须对 DB 目录和日志目录可写）

4. 常用运维命令：

```bat
C:\cz\tools\nssm.exe restart ChangzhengWeb
C:\cz\tools\nssm.exe stop ChangzhengWeb
C:\cz\tools\nssm.exe remove ChangzhengWeb confirm
```

> 服务名建议用 ASCII（`ChangzhengWeb`），别用中文或空格。
> `AppEnvironmentExtra` 一次写多个 `KEY=VALUE` 需要 nssm 2.24；老版本请用 `nssm edit` 的 Environment 页逐条添加。
> 以上 nssm 命令 ⚠️ 未验证：本机未安装 nssm。

**Windows 关库警告**：`server/server.js:573-574` 注册的是 POSIX `SIGTERM/SIGINT`，Windows 上 `process.kill` 送不到这类信号，所以 `nssm stop` 通常会直接结束进程，**优雅关库回调不一定执行**。SQLite 开了 WAL（`server/db.js:19`），崩溃一致性有保障；但**恢复/升级前必须真停服务**，不要靠 `taskkill` 之后立刻覆盖数据库文件。

### 2.2 方案 B：任务计划程序（不想装 nssm）

图形界面步骤（管理员）：

1. 打开「任务计划程序」→ 创建任务（不是「创建基本任务」）。
2. **常规**：名称 `ChangzhengWeb`；勾选「不管用户是否登录都要运行」「使用最高权限运行」。
3. **触发器**：新建 →「启动时」，可勾选「延迟任务 30 秒」等网络就绪。
4. **操作**：新建 → 程序 `C:\Program Files\nodejs\node.exe`；添加参数 `server\server.js`；**起始于** `C:\cz\web`。
5. **设置**：勾选「如果任务失败，按以下频率重新启动」→ `1 分钟` / `3 次`；勾选「如果任务已在运行，则不再启动新实例」。
6. 保存后右键「运行」，再用 `curl http://127.0.0.1:8088/api/health` 验证。

等价的命令行创建（⚠️ 未验证：需要管理员权限）：

```bat
schtasks /create /tn "ChangzhengWeb" /tr "\"C:\Program Files\nodejs\node.exe\" \"C:\cz\web\server\server.js\"" /sc onstart /ru SYSTEM /rl HIGHEST /f
schtasks /run /tn "ChangzhengWeb"
schtasks /query /tn "ChangzhengWeb" /v /fo LIST
```

> `schtasks` 不能设置「起始于」；需要工作目录时改用图形界面，或导出 XML 在 `<Exec>` 里加 `<WorkingDirectory>C:\cz\web</WorkingDirectory>`。
> 本服务的静态根与默认库路径都是绝对路径（`server/server.js:25`、`server/db.js:12`），不依赖工作目录；但 `DB_PATH` 写相对路径时会相对**工作目录**解析，生产环境请一律写绝对路径。
> 以 SYSTEM 运行时，确保 `C:\cz\web\server` 与备份目录对 SYSTEM 可写。

### 2.3 专题站留言服务 :8899（第二个服务）

主站的 `/api/comments*` 只是反代（`server/server.js:199` `proxyComments`），留言的库、后台、限速都在第二个进程里。**只起 8088 时 `/api/comments` 恒返回 503 `COMMENTS_UNAVAILABLE`** —— 那是缺服务的表现，不是 bug。

1. 以**管理员**身份注册第二个服务（服务名建议 `ChangzhengComments`）：

```bat
C:\cz\tools\nssm.exe install ChangzhengComments "C:\Program Files\nodejs\node.exe"
C:\cz\tools\nssm.exe set ChangzhengComments AppDirectory C:\cz\web\competition-timeline
C:\cz\tools\nssm.exe set ChangzhengComments AppParameters "server\server.js"
C:\cz\tools\nssm.exe set ChangzhengComments AppStdout C:\cz\logs\comments.out.log
C:\cz\tools\nssm.exe set ChangzhengComments AppStderr C:\cz\logs\comments.err.log
C:\cz\tools\nssm.exe set ChangzhengComments AppEnvironmentExtra PORT=8899 DB_PATH=C:\cz\data\comments.db
C:\cz\tools\nssm.exe set ChangzhengComments AppRotateFiles 1
C:\cz\tools\nssm.exe set ChangzhengComments AppRotateBytes 10485760
C:\cz\tools\nssm.exe set ChangzhengComments AppStopMethodConsole 15000
C:\cz\tools\nssm.exe set ChangzhengComments Start SERVICE_AUTO_START
C:\cz\tools\nssm.exe start ChangzhengComments
```

`DB_PATH` 不写就是 `C:\cz\web\competition-timeline\server\data.db`（`competition-timeline/server/server.js:36`）；写给的是相对路径会相对**工作目录**解析（`:34-35` 走 `path.resolve`），生产一律写绝对路径。

2. **初始管理员口令**（只增不改的坑）：

- 只在 `users` 表为空时生成（`competition-timeline/server/server.js:302-308`）。要指定口令就在**首次启动前**设 `ADMIN_PASSWORD`；不设则随机 12 位并写进 `C:\cz\web\competition-timeline\server\初始管理员.txt`（同时打印到 stdout）。
- 那个文件是**首次启动那一刻的明文快照**，改密后不会更新，**不代表当前密码**；改完密码直接删掉它。它落在主站静态白名单外（`/competition-timeline/server/` 一律 404），但仍应删。
- 后台 `/admin` 只在 `:8899` 直连可见；经主站访问 `/competition-timeline/admin.html` 恒 404（`scripts/test-api.js` 有断言）。

3. **监听与暴露面**：`server.listen(PORT, '0.0.0.0')`（`competition-timeline/server/server.js:816`）—— 硬编码全接口，**没有 `HOST` 环境变量**。只能靠防火墙限制：8899 只对本机与管理员放行，**绝不要把 8899 映射到公网或对外反代**（留言是匿名外部输入，管理后台同端口）。主站侧只转发 `/api/comments*`，`/api/admin/*` 永不转发（`server/server.js:188-196`）。

4. 验证（两个服务都要起）：

```bat
curl http://127.0.0.1:8899/api/comments?page=series-1
curl http://127.0.0.1:8088/api/comments?page=series-1
```

两条应返回同一个 JSON；停掉 `ChangzhengComments` 后 8088 那条应变成 503 `COMMENTS_UNAVAILABLE`；`curl http://127.0.0.1:8088/api/admin/me` 应返回主站自己的 401 `AUTH_REQUIRED`（说明没被转发出去）。⚠️ 以上 nssm 命令未验证（本机未安装 nssm）。

> 备份别漏第二个库：留言数据是**独立的第二个 SQLite**，`scripts\backup-db.ps1 -All` 一次备两个库（见 5.2）。

---

## 3. 反向代理（80 端口 / 将来 HTTPS）

内网小规模可以不做反代，直接访问 `http://<内网IP>:8088/`。做反代的收益：只暴露 80、隐藏 Node 端口、将来加证书。

### 3.1 IIS + ARR + URL Rewrite

1. 启用 IIS：「启用或关闭 Windows 功能」→ Internet Information Services。
2. 安装 **Application Request Routing 3.0** 与 **URL Rewrite 2.1**（微软 Web Platform Installer / 官方 msi）。
3. IIS 管理器 → 点服务器节点 → **Application Request Routing Cache** → 右侧 **Server Proxy Settings** → 勾选 **Enable proxy**，Time-out 设为 `120` 秒 → 应用。
4. 新建站点：绑定 `http://192.168.1.9:80`（或 `*:80`），物理路径指向 `C:\cz\web`，应用程序池选 **No Managed Code**（集成模式）。
5. 在站点根目录放 `web.config`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="ChangzhengReverseProxy" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="http://127.0.0.1:8088/{R:1}" />
        </rule>
      </rules>
    </rewrite>
    <proxy enabled="true" preserveHostHeader="true" />
    <security>
      <requestFiltering>
        <requestLimits maxAllowedContentLength="10485760" />
      </requestFiltering>
    </security>
  </system.webServer>
</configuration>
```

6. 验证：

```bat
curl http://192.168.1.9/api/health
curl -s -o NUL -w "%{http_code}\n" http://192.168.1.9/
```

- `<proxy>` 节点只有装了 ARR 才合法；若报「无法识别的配置节」，就只保留 `<rewrite>`，代理开关在 IIS 管理器里开。
- 同源反代时 **不需要** `CORS_ORIGIN`，留空即可。
- ⚠️ 未验证：本机未安装 IIS/ARR（需要真内网服务器）。

### 3.2 nginx for Windows

1. 下载 nginx stable（如 1.26.x Windows 版），解压到 `C:\cz\nginx`。
2. 编辑 `C:\cz\nginx\conf\nginx.conf`（整份替换为下面这份最小配置）：

```nginx
worker_processes  1;
events { worker_connections 1024; }

http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile      on;
    keepalive_timeout 65;

    client_max_body_size 10m;
    proxy_connect_timeout 10s;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;

    server {
        listen       80;
        server_name  192.168.1.9;

        location / {
            proxy_pass http://127.0.0.1:8088;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Connection "";
            proxy_buffering off;
        }
    }
}
```

3. 启动与重载：

```bat
cd /d C:\cz\nginx
nginx -t
start nginx
nginx -s reload
nginx -s quit
```

4. 注册为服务（可选）：用 2.1 的 nssm 方式，Application 填 `C:\cz\nginx\nginx.exe`，Startup directory 填 `C:\cz\nginx`。
5. 验证：`curl http://192.168.1.9/api/health`。

> Windows 版 nginx 是单 worker 模型，性能有限；日志在 `C:\cz\nginx\logs`；升级要先 `nginx -s stop` 再替换目录。
> ⚠️ 未验证：本机未安装 nginx（需要真内网服务器）。

### 3.3 反代下的 CORS 与限速（必读）

- **同源（推荐）**：页面和 API 都走同一个 `http://192.168.1.9`，`CORS_ORIGIN` 留空，一个 CORS 头都不需要。
- **前端独立源**（例如前端在 `http://192.168.1.9:8080`）：

```bat
set CORS_ORIGIN=http://192.168.1.9:8080
```

  多个源用英文逗号分隔；必须带协议和端口、不要结尾斜杠。**不要写 `*`**：`server/server.js:134-137`（CORS_ORIGINS）会直接把 `*` 过滤掉，结果是「一个 CORS 头都不回」，比不配还容易误判。
- **限速会退化成全站共享**：`server/server.js:73-76` 的 `clientIp()` 只信 socket 地址、不信任 `X-Forwarded-For`（防伪造）。经反代后所有请求在服务端看来都是 `127.0.0.1`，于是 `RATE_LIMIT_LOGIN/REGISTER` 的 10 次/分钟变成**全站共用**，开赛限速的 IP 桶同理（用户桶仍按账号，不受反代影响，见 `server/server.js:85-90`、`260-266`）。内网几十人规模可把登录/注册限速调大（例如 60）；要做到按人限速需要改代码（本批次不改产品代码）。

---

## 4. 环境变量表

| 变量 | 默认值 | 说明 | 生产建议 |
|---|---|---|---|
| `PORT` | `8088` | HTTP 监听端口 | 保持 8088；反代后防火墙只放行 80/443 |
| `DB_PATH` | `server\data.db`（绝对路径，`server/db.js:12`） | SQLite 文件路径 | 放固定数据盘（如 `D:\cz-data\data.db`），相对路径会相对工作目录解析 |
| `HOST` | `0.0.0.0` | 绑定地址（`server/server.js:28`） | 填内网网卡 IP 只对内网开放；反代时填 `127.0.0.1` |
| `CORS_ORIGIN` | 空（不回 ACAO） | 逗号分隔白名单，`*` 被过滤 | 同源留空；跨源写精确 origin；禁 `*` |
| `RATE_LIMIT` | 未设置（限速开启） | `off/0/false/no` 关闭限速（`server/server.js:78`） | **生产绝不要 off** |
| `RATE_LIMIT_LOGIN` | `10`（60 秒滑动窗口） | 每 IP 每分钟登录次数 | 反代后所有请求同 IP，建议 `60` |
| `RATE_LIMIT_REGISTER` | `10`（60 秒） | 每 IP 每分钟注册次数 | 同上 |
| `RATE_LIMIT_CONTEST_START` | `5`（300 秒窗口） | 开赛接口限速，同时记「用户桶 + IP 桶」，任一超限即 429（`server/server.js:89-90`、`260-266`） | 保持默认 5 次/300 秒；反代后 IP 桶会退化为全站共享（见 3.3） |
| `COMMENTS_UPSTREAM` | `http://127.0.0.1:8899`（`server/server.js:190`） | 留言反代上游：`/api/comments*` 流式转发到这里，5 秒超时（`:212`），连不上回 503 `COMMENTS_UNAVAILABLE` | 与 2.3 的专题站服务同机同端口；跨机部署填 `http://<内网IP>:8899`，并保证只在内网可达 |

启动前设置（cmd，只对当前窗口生效）：

```bat
set PORT=8088
set HOST=192.168.1.9
set DB_PATH=D:\cz-data\data.db
set CORS_ORIGIN=http://192.168.1.9:8080
node server\server.js
```

PowerShell：

```powershell
$env:PORT = "8088"
$env:HOST = "192.168.1.9"
$env:DB_PATH = "D:\cz-data\data.db"
node server\server.js
```

常驻服务用 nssm 的 `AppEnvironmentExtra` 持久化（见 2.1）；任务计划程序没有按任务设环境变量的入口，可写一个 `start-web.bat` 包一层。

---

## 5. 备份与恢复

### 5.1 SQLite 三件套语义

| 文件 | 作用 | 备份要求 |
|---|---|---|
| `data.db` | 主数据库 | 必拷 |
| `data.db-wal` | 预写日志：已提交但尚未 checkpoint 的事务 | **必须一起拷**，漏拷可能丢最近写入 |
| `data.db-shm` | 共享内存索引（WAL 的页索引） | 建议一起拷；单独缺失 SQLite 可重建，但三件套一致最稳 |

WAL 保证的是「崩溃后能恢复到一致状态」，**不是**「只拷 data.db 就是最新快照」。两种安全做法：

1. **停服务后拷贝三件套**（最稳，恢复/迁移首选）。
2. **服务运行时用共享读方式拷贝三件套**（本仓库脚本已实现），建议放在低峰期，并优先用 `-ServiceName` 停服。

### 5.2 备份脚本用法

脚本：`scripts\backup-db.ps1`（UTF-8 with BOM，兼容 Windows PowerShell 5.1 中文输出）。

| 参数 | 默认值 | 说明 |
|---|---|---|
| `-DbPath` | `..\server\data.db`（相对**脚本目录**解析为绝对路径） | 要备份的数据库；可给**多个**（`p1,p2`），语义与 `-All` 相同 |
| `-All` | 关 | 一次备两个库：`..\server\data.db` + `..\competition-timeline\server\data.db`；与 `-DbPath` **互斥**（同时给直接报错退出） |
| `-BackupDir` | `<repo>\backup` | 备份根目录 |
| `-Keep` | `14` | 保留最近 N 份时间戳目录，超出自动清理 |
| `-ServiceName` | 空 | 给了就先 `nssm stop`，拷完再 `nssm start`；可给**多个**（主站 + 留言）。没给则只做一致性拷贝并提示建议停服务 |

常用命令：

```powershell
# 默认：只备主站 server\data.db 到 <repo>\backup\<时间戳>\
powershell -NoProfile -ExecutionPolicy Bypass -File C:\cz\web\scripts\backup-db.ps1

# 生产推荐：主站库 + 专题站留言库一起备，并先停两个服务（最稳）
powershell -NoProfile -ExecutionPolicy Bypass -File C:\cz\web\scripts\backup-db.ps1 -All -ServiceName ChangzhengWeb,ChangzhengComments

# 指定库与目录、保留 30 份
powershell -NoProfile -ExecutionPolicy Bypass -File C:\cz\web\scripts\backup-db.ps1 -DbPath D:\cz-data\data.db -BackupDir D:\cz-backup -Keep 30
```

脚本行为：建时间戳子目录（同一秒重复会自动加 `-1` 后缀）→ 逐个拷贝存在的 `data.db` / `-wal` / `-shm`（共享读，不阻塞运行中的 SQLite）→ 计算 SHA256 写 `manifest.txt` → 清理超出 `-Keep` 的旧备份 → 打印备份路径与总大小；任何一步失败都 `exit 1` 并打印原因。

**多库模式**（`-All` 或给多个 `-DbPath`）：两个库的文件名都叫 `data.db`，平铺会互相覆盖，所以每库落到时间戳目录下的 `db1\`、`db2\` 子目录，`manifest.txt` 用「源数据库:」段里的 `db1\ = <源路径>` 说明对应关系。**其中某个库不存在时只跳过并告警，不算失败**（比如还没起过留言服务）。单库模式仍是原来的平铺布局（`<时间戳>\data.db`），老的恢复流程不用改。

### 5.3 实跑输出（本机临时库，未触碰 server\data.db）

```text
[backup] 已拷贝 data.db (4096 字节)
[backup] 已拷贝 data.db-wal (828152 字节)
[backup] 已拷贝 data.db-shm (32768 字节)
备份完成: C:\Users\liwenyang\AppData\Local\Temp\cz-doc\out4\20261022-200140
  data.db  4,096 字节  sha256=d872a52e869261dc4cf51c6a70fd85736916c38e14fc5d704cd8f74a406c4942
  data.db-wal  828,152 字节  sha256=d5e8c64deab61d25a8ea0ed3da3db442aa57f2f6b324c2155daa017c4c5dc035
  data.db-shm  32,768 字节  sha256=15efff391f31c1f2618e242901c93baff7f91ca7d3ecc49c7c129a7522865a59
总大小: 0.82 MB
旧备份: 无超出保留份数的目录
保留策略: 最近 3 份
```

manifest.txt 内容：

```text
# 长征 web 数据库备份清单
备份时间: 2026-10-22 20:01:40 +08:00
源数据库:
  C:\Users\liwenyang\AppData\Local\Temp\cz-doc\src\data.db
服务处理: 未停服务（共享读一致性拷贝）

文件:
data.db  sha256=d872a52e869261dc4cf51c6a70fd85736916c38e14fc5d704cd8f74a406c4942  bytes=4096
data.db-wal  sha256=d5e8c64deab61d25a8ea0ed3da3db442aa57f2f6b324c2155daa017c4c5dc035  bytes=828152
data.db-shm  sha256=15efff391f31c1f2618e242901c93baff7f91ca7d3ecc49c7c129a7522865a59  bytes=32768
```

备份的一致性也实测过：把三件套拷到新目录后用 `node:sqlite` 打开，能读出全部数据（`restored rows=3`）；`Get-FileHash` / `certutil` 与 manifest 的 SHA256 一致。

`-All` 多库模式（本机实跑，此时留言库还不存在 → 只跳过并告警，退出码 0）：

```text
[backup] 跳过（文件不存在）: C:\cz\web\competition-timeline\server\data.db
[backup] 已拷贝 db1\data.db (4096 字节)
[backup] 已拷贝 db1\data.db-wal (828152 字节)
[backup] 已拷贝 db1\data.db-shm (32768 字节)
备份完成: <repo>\backup\20261022-200113
  db1\data.db  4,096 字节  sha256=d872a52e869261dc4cf51c6a70fd85736916c38e14fc5d704cd8f74a406c4942
  db1\data.db-wal  828,152 字节  sha256=d5e8c64deab61d25a8ea0ed3da3db442aa57f2f6b324c2155daa017c4c5dc035
  db1\data.db-shm  32,768 字节  sha256=15efff391f31c1f2618e242901c93baff7f91ca7d3ecc49c7c129a7522865a59
总大小: 0.82 MB
保留策略: 最近 14 份
```

manifest.txt 对应的「源数据库:」段（两个库都在时是两行 `db1\` / `db2\`）：

```text
源数据库:
  db1\ = C:\cz\web\server\data.db
  db2\ = C:\cz\web\competition-timeline\server\data.db
```

### 5.4 每日自动备份

```bat
schtasks /create /tn "ChangzhengWebBackup" /tr "powershell -NoProfile -ExecutionPolicy Bypass -File C:\cz\web\scripts\backup-db.ps1 -All -Keep 30" /sc daily /st 02:00 /ru SYSTEM /rl HIGHEST /f
schtasks /run /tn "ChangzhengWebBackup"
```

> ⚠️ 未验证：创建计划任务需要管理员权限。
> 加 `-All` 才是两个库都备（主站 + 留言）；只给 `-Keep 30` 就只备 `server\data.db`，留言会漏。
> 备份目录建议放**另一块盘**（如 `D:\cz-backup`），并用 `-BackupDir` 指过去。

### 5.5 恢复步骤

```bat
REM 1) 停服务（三选一：nssm / 服务管理器 / 任务计划程序「结束」）
C:\cz\tools\nssm.exe stop ChangzhengWeb
tasklist | findstr /i "node.exe"

REM 2) 把当前库整体挪走留证（不要直接删）
mkdir D:\cz-backup\broken 2>nul
move C:\cz\web\server\data.db     D:\cz-backup\broken\data.db
move C:\cz\web\server\data.db-wal D:\cz-backup\broken\data.db-wal
move C:\cz\web\server\data.db-shm D:\cz-backup\broken\data.db-shm

REM 3) 拷回备份三件套（以 20261021-172551 为例）
copy /y D:\cz-backup\20261021-172551\data.db     C:\cz\web\server\data.db
copy /y D:\cz-backup\20261021-172551\data.db-wal C:\cz\web\server\data.db-wal
copy /y D:\cz-backup\20261021-172551\data.db-shm C:\cz\web\server\data.db-shm

REM 4) 校验（与 manifest.txt 里的 sha256 对比）
certutil -hashfile C:\cz\web\server\data.db SHA256

REM 5) 启动并验活
C:\cz\tools\nssm.exe start ChangzhengWeb
curl http://127.0.0.1:8088/api/health
curl -s -o NUL -w "%{http_code}\n" http://127.0.0.1:8088/
```

要点：

- **旧 `-wal/-shm` 绝不能和新 `data.db` 混用**，否则可能读到错乱页；换库时要么三件套一起换，要么先删掉旧的两个附属文件（仅在服务已停的前提下）。
- 恢复后至少做一次登录 + 打卡 + 取题冒烟，确认数据可写，而不只是健康检查。
- 备份目录与数据库目录不要放同一块盘，避免一起坏。
- **留言库要单独恢复**：停 `ChangzhengComments` → 从备份里取留言库的三件套（`-All` 备份里是 `db2\data.db*`，单库备份里就叫 `data.db*`）→ 覆盖到 `C:\cz\web\competition-timeline\server\` → 起服务；不恢复它只会丢留言，主站打卡/账号不受影响（`/api/comments` 会一直是 503，直到库就位）。
---

## 6. 升级流程

```bat
cd /d C:\cz\web
git status --porcelain
git pull --ff-only

REM 两套测试都跑（test-api 用 %TEMP% 临时库和独立端口，不碰 server\data.db）
node scripts\test-web.js
node scripts\test-api.js

REM 重启服务并冒烟
C:\cz\tools\nssm.exe restart ChangzhengWeb
curl http://127.0.0.1:8088/api/health
curl -s -o NUL -w "%{http_code}\n" http://127.0.0.1:8088/
curl -s -o NUL -w "%{http_code}\n" http://127.0.0.1:8088/api/nodes
```

基线（✅ 实测，2026-10-21；提交 `153cf33` 时为 50/110，批次⑧的断言并行落地后为）：

```text
node scripts/test-web.js  ->  ALL PASSED（61 项）
node scripts/test-api.js  ->  API 测试结果: 114 通过 / 0 失败
```

- `scripts/test-api.js:13-14` 把 `DB_PATH` 指向 `os.tmpdir()` 下的临时文件，不会动生产库；但仍建议升级前先跑一次备份。
- 回滚：升级前记录 `git rev-parse HEAD`；出问题 `git reset --hard <旧提交>` 后重启服务（⚠️ 未验证：本机未实际 pull/回滚）。
- 没有 `node_modules`、没有构建步骤，`git pull` 完即可运行。

---

## 7. 排障表

### 7.1 EADDRINUSE：端口被占用

现象：启动即退出，日志 `启动失败：端口 8088 已被占用（EADDRINUSE）`（`server/server.js:655-659`）。

```bat
netstat -ano | findstr :8088
taskkill /PID 12345 /F
```

✅ 实测 `netstat` 能列出 `0.0.0.0:8088 LISTENING <PID>`；`taskkill /PID <pid> /F` 可结束进程。也可以换端口：

```bat
set PORT=8089
node server\server.js
```

### 7.2 其它机器打不开（端口不通）

按顺序排查：

```bat
REM 1) 本机自测
curl http://127.0.0.1:8088/api/health

REM 2) 用内网 IP 自测（验证绑定地址）
curl http://192.168.1.9:8088/api/health

REM 3) 看监听地址是不是 0.0.0.0 或内网 IP
netstat -ano | findstr :8088

REM 4) 放行入站（管理员；建议限定网段）
netsh advfirewall firewall add rule name="ChangzhengWeb 8088" dir=in action=allow protocol=TCP localport=8088 remoteip=192.168.1.0/24
netsh advfirewall firewall show rule name="ChangzhengWeb 8088"
```

- 若 `HOST` 被设成 `127.0.0.1`，只有本机能访问 —— 改成 `0.0.0.0` 或内网网卡 IP。
- 公司网络若有 VLAN/ACL，还需网络管理员放行。
- ⚠️ 未验证：防火墙命令需要管理员权限，且会改动本机安全策略，本次未执行。

### 7.3 数据库被占用 / database is locked

- 先确认没有多个 Node 实例抢同一个库：

```bat
tasklist | findstr /i "node.exe"
netstat -ano | findstr :8088
```

- 停掉所有实例后再操作库文件；不要在服务运行时删除 `-wal/-shm`。
- 备份请在低峰期，或直接用 `-ServiceName` 让脚本停服拷贝。
- 报 `SQLITE_BUSY` 时不要反复重启服务硬顶，先确认是否有旧进程/杀毒软件锁文件。

### 7.4 白屏 / 接口 405 / 接口 404

- **白屏**：用「查看源代码」确认拿到的是不是 `index.html`；若用静态服务器（`python -m http.server`、VS Code Live Server、没配 ARR 的 IIS）打开，`js/config.js` 可能仍指向 `USE_MOCK: true`，属于游客体验，不写库。
- **接口 405**：本服务对非 GET/HEAD 的静态请求返回 405（`server/server.js:624-627`），HEAD 也返回 405（测试有断言）。如果你在静态服务器上 `POST /api/login` 得到 405/501，说明**根本没打到 Node 后端**，改用 `node server\server.js` 或配好反代。
- **接口 404**：`/server/**`、`*.db`、`*.md` 被静态白名单挡掉是**设计如此**（`server/server.js:48-57`），不要试图通过 URL 下载数据库。
- **登录 401 / 请先登录**：没带 token 或 token 过期，属正常鉴权。

### 7.5 其它

| 现象 | 原因 / 处理 |
|---|---|
| `Cannot find module 'node:sqlite'` | Node < 22.5，升级 Node |
| `ExperimentalWarning: SQLite ...` | Node 22 的正常提示，忽略 |
| 浏览器控制台 CORS 报错 | `CORS_ORIGIN` 没配或与页面 origin 不完全一致（协议/端口都要一致）；同源反代则留空 |
| 中文日志乱码 | 用 Windows Terminal / 命令提示符 65001 代码页；脚本本身是 UTF-8 with BOM，PowerShell 5.1 可正常读中文 |
| `EADDRINUSE` 但 netstat 看不到 | 可能被 Hyper-V/WSL 保留端口占用，`netsh interface ipv4 show excludedportrange protocol=tcp` 查保留段，换端口最省事 |

---

## 8. 安全清单（正式活动前逐项打勾）

- [ ] **限速保持开启**：不要设置 `RATE_LIMIT=off`；登录/注册按规模调整，不要关。
- [ ] **不要用 `?demo=1` 对外发链接**：它会用硬编码账号自动登录（`js/config.js:34-55`），拿到链接即拿到 demo 账号；正式活动一律用真实账号，必要时加 `?login=1` 强制登录页。
- [ ] **`CORS_ORIGIN` 不写 `*`**：写了会被过滤成「完全不回 CORS 头」（`server/server.js:134-137`），跨源场景要写精确 origin。
- [ ] **只对内网放行 8088**：防火墙规则限定 `remoteip=192.168.1.0/24`；不要把 8088 映射到公网。
- [ ] **数据库三件套不入版本库**：`server/data.db` 已在 `.gitignore`；当前 `.gitignore:5-8` 只写了 `data.db` 与 `data.db-journal`，**`-wal/-shm` 需人工确认**——首次提交前跑 `git status --porcelain`，看到 `server/data.db-wal` / `server/data.db-shm` 就补进 `.gitignore`（本批次不改 `.gitignore`）。
- [ ] **正式活动前替换占位内容**：`js/mock/` 的占位文案与 `server/question-bank.json` 题库；静态模式的题库是公开的，正式考试必须走后端（答案不下发）。
- [ ] **服务账号最小权限**：不要长期用 Administrator 跑；给专用账号只授 DB 目录、日志目录、备份目录的写权限。
- [ ] **备份异地/异盘**：备份目录与数据库不同盘，定期抽查一次恢复。
- [ ] **出内网就上 HTTPS**：内网 HTTP 下密码是明文传输；一旦跨网段/远程访问，前置 IIS/nginx 配证书。

---

## 9. 命令验证记录

| 章节 | 命令 / 断言 | 结果 | 状态 |
|---|---|---|---|
| 1.2 | `node -v` | v22.14.0 | ✅ |
| 1.2 | `node -e "require('node:sqlite')..."` | 打印 node:sqlite OK + ExperimentalWarning | ✅ |
| 1.3 | `node server\server.js`（临时 DB，8088） | 正常监听 0.0.0.0:8088，题库导入 24 题 | ✅ |
| 1.4 | `curl /api/health` | `{"ok":true,...}` | ✅ |
| 1.4 | 首页 / `/api/nodes` 状态码 | 200 / 200 | ✅ |
| 1.5 | `ipconfig` 取 IPv4 | 取到 192.168.1.9 | ✅ |
| 2.x | nssm install/set/start/edit | — | ⚠️ 未验证：本机未装 nssm |
| 2.2 | `schtasks /create` | — | ⚠️ 未验证：需要管理员权限 |
| 3.1 | IIS + ARR + web.config | — | ⚠️ 未验证：需要真内网服务器 |
| 3.2 | nginx -t / start / reload | — | ⚠️ 未验证：本机未装 nginx |
| 5.2 | `backup-db.ps1` 正常路径（含 -wal/-shm） | 三件套备份 + manifest + 轮转清理，exit 0 | ✅ |
| 5.2 | 仅 `data.db`（无 wal/shm） | 只拷存在的文件，exit 0 | ✅ |
| 5.2 | 缺库 / `-Keep 0` / 无 nssm 却传 `-ServiceName` | 均打印原因并 exit 1 | ✅ |
| 5.3 | 备份恢复验证 | 拷贝三件套后读出 `rows=3`；SHA256 与 manifest 一致 | ✅ |
| 6 | 两套测试基线 | 61 项全过 / 114 通过 0 失败 | ✅ |
| 6 | `git pull --ff-only` / 回滚 | — | ⚠️ 未验证：未实际拉取 |
| 7.1 | `netstat -ano \| findstr :8088` / `taskkill /PID ... /F` | 能定位并结束进程 | ✅ |
| 7.2 | `netsh advfirewall firewall add ...` | — | ⚠️ 未验证：需要管理员权限 |

> 结论：应用层命令（启动、健康检查、备份、测试、端口排查）已在本机实测；系统层组件（nssm / IIS / nginx / 防火墙 / 计划任务）需要在真内网服务器上按本文执行并复核。
