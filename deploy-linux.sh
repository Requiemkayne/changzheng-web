#!/usr/bin/env bash
# ============================================================
#  长征网站 · Linux 一键部署脚本
#  用法（在解压后的目录里执行，或用 -d 指定目录）：
#    sudo bash deploy-linux.sh
#    bash deploy-linux.sh -d /opt/changzheng
#
#  做的事：检查/安装 Node -> 起两个服务 -> 配 systemd 开机自启
#          -> 打印访问地址和防火墙命令
# ============================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_MAJOR_MIN=22
PORT_MAIN="${PORT_MAIN:-8088}"
PORT_COMMENTS="${PORT_COMMENTS:-8899}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -d|--dir) APP_DIR="$2"; shift 2 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()  { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn(){ printf '  \033[33m!\033[0m %s\n' "$*"; }
die() { printf '  \033[31m✗\033[0m %s\n' "$*"; exit 1; }

# ---------- 1. 检查目录 ----------
say "检查项目目录"
[[ -f "$APP_DIR/index.html" ]] || die "目录里没有 index.html，请在解压后的项目根目录执行"
[[ -f "$APP_DIR/server/server.js" ]] || die "缺少 server/server.js"
ok "项目目录: $APP_DIR"

# ---------- 2. 检查 Node ----------
say "检查 Node.js（需要 ${NODE_MAJOR_MIN}+）"
if command -v node >/dev/null 2>&1; then
  NODE_V=$(node -v)
  NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
  if [[ "$NODE_MAJOR" -ge "$NODE_MAJOR_MIN" ]]; then
    ok "已安装 $NODE_V"
  else
    warn "Node 版本过低（$NODE_V），需要 ${NODE_MAJOR_MIN}+"
    die "请先升级 Node：https://nodejs.org 或用脚本末尾的离线安装方法"
  fi
else
  warn "未安装 Node.js，尝试安装..."
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR_MIN}.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf module install -y nodejs:${NODE_MAJOR_MIN}
  elif command -v yum >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_${NODE_MAJOR_MIN}.x | sudo -E bash -
    sudo yum install -y nodejs
  else
    die "无法自动安装，请手动装 Node ${NODE_MAJOR_MIN}+ 后重跑"
  fi
  command -v node >/dev/null 2>&1 || die "安装后仍找不到 node"
  ok "已安装 $(node -v)"
fi

# ---------- 3. 启动自检 ----------
say "启动自检"
cd "$APP_DIR"
PORT=$PORT_MAIN node server/server.js > /tmp/cz-main.log 2>&1 &
MPID=$!
sleep 3
if curl -fsS "http://127.0.0.1:${PORT_MAIN}/" >/dev/null 2>&1; then
  ok "主站能起来（:$PORT_MAIN）"
else
  warn "主站没起来，日志："
  tail -20 /tmp/cz-main.log
  kill $MPID 2>/dev/null || true
  die "请把上面的日志发出来排查"
fi
kill $MPID 2>/dev/null || true
sleep 1

PORT=$PORT_COMMENTS node competition-timeline/server/server.js > /tmp/cz-comments.log 2>&1 &
CPID=$!
sleep 3
if curl -fsS "http://127.0.0.1:${PORT_COMMENTS}/api/health" >/dev/null 2>&1; then
  ok "留言服务能起来（:$PORT_COMMENTS）"
else
  warn "留言服务没起来（主站仍可用，/api/comments 会返回 503）"
  tail -10 /tmp/cz-comments.log || true
fi
kill $CPID 2>/dev/null || true

# ---------- 4. 配 systemd ----------
if [[ "$(id -u)" -ne 0 ]]; then
  warn "不是 root，跳过 systemd 配置。想配开机自启用：sudo bash $0 -d $APP_DIR"
else
  say "配置 systemd 开机自启"
  NODE_BIN="$(command -v node)"

  cat > /etc/systemd/system/changzheng.service <<EOF
[Unit]
Description=Changzheng main site (port ${PORT_MAIN})
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
ExecStart=${NODE_BIN} server/server.js
Restart=always
RestartSec=3
Environment=PORT=${PORT_MAIN}

[Install]
WantedBy=multi-user.target
EOF

  cat > /etc/systemd/system/changzheng-comments.service <<EOF
[Unit]
Description=Changzheng comments service (port ${PORT_COMMENTS})
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
ExecStart=${NODE_BIN} competition-timeline/server/server.js
Restart=always
RestartSec=3
Environment=PORT=${PORT_COMMENTS}
Environment=HOST=127.0.0.1

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable --now changzheng >/dev/null 2>&1
  systemctl enable --now changzheng-comments >/dev/null 2>&1
  sleep 2
  systemctl is-active --quiet changzheng && ok "changzheng 已启动" || warn "changzheng 未启动"
  systemctl is-active --quiet changzheng-comments && ok "changzheng-comments 已启动" || warn "changzheng-comments 未启动"
fi

# ---------- 5. 打印访问地址 ----------
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
[[ -z "${IP:-}" ]] && IP="<本机IP>"

say "部署完成"
cat <<EOF

  局域网访问：
    http://${IP}:${PORT_MAIN}/?demo=1
    http://${IP}:${PORT_MAIN}/?demo=1#/map
    http://${IP}:${PORT_MAIN}/competition-timeline/

  管理后台（只在本机用）：
    http://127.0.0.1:${PORT_COMMENTS}/admin

  常用命令：
    sudo systemctl status changzheng
    sudo systemctl restart changzheng changzheng-comments
    sudo journalctl -u changzheng -f          # 看实时日志

  如果别的机器打不开，开放防火墙：
    sudo ufw allow ${PORT_MAIN}/tcp            # Ubuntu
    sudo firewall-cmd --add-port=${PORT_MAIN}/tcp --permanent && sudo firewall-cmd --reload   # CentOS

  注意：${PORT_COMMENTS} 端口只给本机（HOST=127.0.0.1），不要对外开放。

EOF
