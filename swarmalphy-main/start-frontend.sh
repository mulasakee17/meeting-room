#!/bin/bash
# SwarmAlpha 前端启动脚本
# 在 swarmalphy-main 目录下运行: bash start-frontend.sh

cd "$(dirname "$0")"

# 清理 5173 端口残留进程
echo "🔍 检查端口 5173..."
PID=$(netstat -ano 2>/dev/null | grep ':5173 ' | grep LISTENING | awk '{print $NF}' | head -1)
if [ -n "$PID" ]; then
  echo "⚠️  端口 5173 被 PID $PID 占用，正在终止..."
  taskkill //F //PID $PID 2>/dev/null
  sleep 1
fi

# 清理 Vite 缓存
echo "🧹 清理 Vite 缓存..."
rm -rf node_modules/.vite dist .output 2>/dev/null

# 启动 Vite
echo "🚀 启动前端 UI (Vite + TanStack Start)..."
npx vite dev --port 5173 --host
