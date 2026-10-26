#!/bin/sh
set -eu

APP_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd)
cd "$APP_DIR"

PORT=${PORT:-9850}
HOST=${HOST:-0.0.0.0}
NODE_BIN=${NODE_BIN:-node}

RUN_DIR="$APP_DIR/run"
LOG_DIR="$APP_DIR/logs"
PID_FILE="$RUN_DIR/server.pid"
LOG_FILE="$LOG_DIR/server.log"

usage() {
  printf '%s\n' \
    '用法: sh start.sh [start|stop|restart|status|logs|fg]' \
    '  start    后台启动服务（默认）' \
    '  stop     停止服务' \
    '  restart  重启服务' \
    '  status   查看运行状态' \
    '  logs     跟踪查看日志' \
    '  fg       前台运行，适合 systemd 或容器' \
    '' \
    '环境变量: PORT（默认 9850）、HOST（默认 0.0.0.0）、NODE_BIN'
}

if ! command -v "$NODE_BIN" >/dev/null 2>&1; then
  printf '%s\n' "错误: 找不到 Node.js（$NODE_BIN）。请先安装 Node.js 18 或更高版本。" >&2
  exit 1
fi

if ! "$NODE_BIN" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)' >/dev/null 2>&1; then
  printf '%s\n' "错误: Node.js 版本过低，需要 18 或更高版本。" >&2
  exit 1
fi

read_pid() {
  if [ ! -f "$PID_FILE" ]; then
    return 1
  fi
  pid=$(cat "$PID_FILE" 2>/dev/null || true)
  case "$pid" in
    ''|*[!0-9]*) return 1 ;;
  esac
  printf '%s' "$pid"
}

is_running() {
  pid=$(read_pid) || return 1
  kill -0 "$pid" 2>/dev/null
}

start() {
  if is_running; then
    printf '服务已在运行（PID %s）。\n' "$(read_pid)"
    return 0
  fi

  mkdir -p "$RUN_DIR" "$LOG_DIR"
  rm -f "$PID_FILE"

  printf '启动材林——素材之森林，监听 %s:%s ...\n' "$HOST" "$PORT"
  PORT="$PORT" HOST="$HOST" nohup "$NODE_BIN" server.js >>"$LOG_FILE" 2>&1 &
  pid=$!
  printf '%s\n' "$pid" > "$PID_FILE"

  sleep 1
  if kill -0 "$pid" 2>/dev/null; then
    printf '启动成功（PID %s）。\n' "$pid"
    printf '访问地址: http://<服务器IP>:%s\n' "$PORT"
    printf '日志文件: %s\n' "$LOG_FILE"
    return 0
  fi

  rm -f "$PID_FILE"
  printf '%s\n' '启动失败，最近日志：' >&2
  tail -n 30 "$LOG_FILE" 2>/dev/null || true
  exit 1
}

stop() {
  if ! is_running; then
    rm -f "$PID_FILE"
    printf '%s\n' '服务未运行。'
    return 0
  fi

  pid=$(read_pid)
  printf '停止服务（PID %s）...\n' "$pid"
  kill "$pid" 2>/dev/null || true

  i=0
  while kill -0 "$pid" 2>/dev/null && [ "$i" -lt 10 ]; do
    sleep 1
    i=$((i + 1))
  done

  if kill -0 "$pid" 2>/dev/null; then
    printf '%s\n' '进程未在 10 秒内退出，强制结束。'
    kill -9 "$pid" 2>/dev/null || true
  fi

  rm -f "$PID_FILE"
  printf '%s\n' '服务已停止。'
}

status() {
  if is_running; then
    printf '服务运行中（PID %s），监听 %s:%s。\n' "$(read_pid)" "$HOST" "$PORT"
    printf '日志: %s\n' "$LOG_FILE"
  else
    printf '%s\n' '服务未运行。'
    exit 1
  fi
}

show_logs() {
  if [ ! -f "$LOG_FILE" ]; then
    printf '日志文件不存在: %s\n' "$LOG_FILE" >&2
    exit 1
  fi
  tail -n 80 -f "$LOG_FILE"
}

case "${1:-start}" in
  start)
    start
    ;;
  stop)
    stop
    ;;
  restart)
    stop
    start
    ;;
  status)
    status
    ;;
  logs)
    show_logs
    ;;
  fg)
    exec env PORT="$PORT" HOST="$HOST" "$NODE_BIN" server.js
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
