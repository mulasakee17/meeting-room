#!/bin/bash
# SwarmAlpha 后端启动脚本
# 在 swarmalpha 目录下运行: bash start-backend.sh

cd "$(dirname "$0")"

# 清理 3000 端口残留进程
echo "🔍 检查端口 3000..."
PID=$(netstat -ano 2>/dev/null | grep ':3000 ' | grep LISTENING | awk '{print $NF}' | head -1)
if [ -n "$PID" ]; then
  echo "⚠️  端口 3000 被 PID $PID 占用，正在终止..."
  taskkill //F //PID $PID 2>/dev/null
  sleep 1
fi

# 启动 Next.js
echo "🚀 启动后端 API (Next.js)..."
npx next dev
