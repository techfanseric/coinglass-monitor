#!/bin/bash

# CoinGlass 监控系统 macOS 一键部署脚本
# 兼容 macOS 10.15+ (Catalina 及以上版本)
# 作者: 自动生成

set -e  # 遇到错误立即退出

# 颜色输出函数
print_color() {
    case $1 in
        "red")     echo -e "\033[31m$2\033[0m" ;;
        "green")   echo -e "\033[32m$2\033[0m" ;;
        "yellow")  echo -e "\033[33m$2\033[0m" ;;
        "blue")    echo -e "\033[34m$2\033[0m" ;;
        "purple")  echo -e "\033[35m$2\033[0m" ;;
        "cyan")    echo -e "\033[36m$2\033[0m" ;;
        "white")   echo -e "\033[37m$2\033[0m" ;;
        *)         echo "$2" ;;
    esac
}

# 检查是否以 root 权限运行
check_root() {
    if [[ $EUID -eq 0 ]]; then
        print_color "yellow" "⚠️  警告: 检测到以 root 权限运行，建议使用普通用户权限"
        read -p "是否继续? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# 检查网络连接
check_network() {
    print_color "cyan" "🔍 检查网络连接..."
    if ! ping -c 1 google.com &> /dev/null; then
        print_color "red" "✗ 网络连接检查失败，请确保网络连接正常"
        exit 1
    fi
    print_color "green" "✓ 网络连接正常"
}

# 检查 macOS 版本
check_macos_version() {
    print_color "cyan" "🔍 检查 macOS 版本..."
    local version=$(sw_vers -productVersion)
    local major_version=$(echo $version | cut -d. -f1)

    if [[ $major_version -lt 11 ]]; then
        print_color "red" "✗ macOS 版本过低 ($version)，需要 macOS 11.0 (Big Sur) 或更高版本"
        exit 1
    fi

    print_color "green" "✓ macOS 版本检查通过 (版本: $version)"
}

# 检查并安装 Homebrew
install_homebrew() {
    print_color "cyan" "🍺 检查 Homebrew..."

    if command -v brew &> /dev/null; then
        local brew_version=$(brew --version | head -n1)
        print_color "green" "✓ Homebrew 已安装: $brew_version"

        # 更新 Homebrew
        print_color "cyan" "更新 Homebrew..."
        if brew update &> /dev/null; then
            print_color "green" "✓ Homebrew 更新完成"
        else
            print_color "yellow" "⚠️  Homebrew 更新失败，继续使用现有版本"
        fi
        return 0
    fi

    print_color "yellow" "Homebrew 未安装，正在安装..."

    # 安装 Homebrew
    if /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"; then
        print_color "green" "✓ Homebrew 安装成功"

        # 添加到 PATH (Apple Silicon Mac)
        if [[ $(uname -m) == "arm64" ]]; then
            echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
            eval "$(/opt/homebrew/bin/brew shellenv)"
        fi
        return 0
    else
        print_color "red" "✗ Homebrew 安装失败"
        print_color "yellow" "请手动安装 Homebrew: https://brew.sh/"
        exit 1
    fi
}

# 检查并安装 Node.js
install_nodejs() {
    if [[ "$SKIP_NODE_INSTALL" == "true" ]]; then
        print_color "yellow" "跳过 Node.js 安装检查"
        return 0
    fi

    print_color "cyan" "📦 检查 Node.js..."

    if command -v node &> /dev/null; then
        local node_version=$(node --version)
        print_color "green" "✓ Node.js 已安装: $node_version"

        # 检查版本是否满足要求 (需要 Node.js 16+)
        local major_version=$(echo $node_version | sed 's/^v//' | cut -d. -f1)
        if [[ $major_version -lt 16 ]]; then
            print_color "yellow" "⚠️  Node.js 版本过低 ($node_version)，建议升级到 16.x 或更高版本"
            read -p "是否自动升级 Node.js? (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                print_color "cyan" "正在升级 Node.js..."
                if brew install node &> /dev/null; then
                    print_color "green" "✓ Node.js 升级成功"
                    node_version=$(node --version)
                    print_color "green" "当前版本: $node_version"
                else
                    print_color "red" "✗ Node.js 升级失败"
                fi
            fi
        fi
        return 0
    fi

    print_color "yellow" "Node.js 未安装，正在安装..."

    # 使用 Homebrew 安装 Node.js
    if brew install node &> /dev/null; then
        local node_version=$(node --version)
        print_color "green" "✓ Node.js 安装成功: $node_version"
        return 0
    else
        print_color "red" "✗ Node.js 安装失败"
        print_color "yellow" "请手动安装 Node.js: https://nodejs.org/"
        exit 1
    fi
}

# 检查并安装 Git
install_git() {
    print_color "cyan" "📦 检查 Git..."

    if command -v git &> /dev/null; then
        local git_version=$(git --version)
        print_color "green" "✓ Git 已安装: $git_version"
        return 0
    fi

    print_color "yellow" "Git 未安装，正在安装..."

    # 使用 Homebrew 安装 Git
    if brew install git &> /dev/null; then
        local git_version=$(git --version)
        print_color "green" "✓ Git 安装成功: $git_version"
        return 0
    else
        print_color "red" "✗ Git 安装失败"
        print_color "yellow" "请手动安装 Git: https://git-scm.com/download/mac"
        exit 1
    fi
}

# 检查 Chrome 安装
check_chrome() {
    if [[ "$SKIP_CHROME_CHECK" == "true" ]]; then
        print_color "yellow" "跳过 Chrome 安装检查"
        return 0
    fi

    print_color "cyan" "🌐 检查 Google Chrome..."

    local chrome_paths=(
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        "/Applications/Chromium.app/Contents/MacOS/Chromium"
        "$HOME/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    )

    for path in "${chrome_paths[@]}"; do
        if [[ -f "$path" ]]; then
            print_color "green" "✓ Google Chrome 已安装: $path"
            return 0
        fi
    done

    print_color "red" "✗ 未找到 Google Chrome 安装"
    print_color "yellow" "正在尝试安装 Google Chrome..."

    # 使用 Homebrew Cask 安装 Chrome
    if brew install --cask google-chrome &> /dev/null; then
        print_color "green" "✓ Google Chrome 安装成功"
        return 0
    else
        print_color "red" "✗ Google Chrome 自动安装失败"
        print_color "yellow" "请手动下载并安装 Chrome: https://www.google.com/chrome/"
        exit 1
    fi
}

# 初始化项目
initialize_project() {
    print_color "cyan" "🚀 正在初始化项目环境..."

    # 检查是否在项目目录中
    if [[ ! -f "package.json" ]]; then
        print_color "red" "错误: 未找到 package.json，请确保在项目根目录中运行此脚本"
        exit 1
    fi

    # 安装依赖
    print_color "cyan" "📦 正在安装项目依赖..."
    if npm install; then
        print_color "green" "✓ 项目依赖安装完成"
    else
        print_color "red" "✗ 项目依赖安装失败"
        exit 1
    fi

    # 创建 .env 文件
    if [[ ! -f ".env" ]]; then
        print_color "cyan" "📝 正在创建 .env 配置文件..."
        if cp .env.example .env 2>/dev/null; then
            print_color "green" "✓ .env 文件创建完成"
        else
            print_color "yellow" "⚠️  无法自动创建 .env 文件，请手动复制 .env.example 为 .env"
        fi
    else
        print_color "green" "✓ .env 文件已存在"
    fi

    # 运行设置脚本
    print_color "cyan" "⚙️  正在运行项目设置脚本..."
    if npm run setup 2>/dev/null; then
        print_color "green" "✓ 项目设置完成"
    else
        print_color "yellow" "⚠️  项目设置脚本执行失败，但可能不影响主要功能"
    fi

    return 0
}

# 启动应用
start_application() {
    print_color "cyan" "🚀 正在启动 CoinGlass 监控系统..."

    # 检查端口是否被占用
    local port=${PORT:-3000}
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_color "yellow" "⚠️  端口 $port 已被占用，尝试终止现有进程..."
        pkill -f "node.*app.js" 2>/dev/null || true
        sleep 2
    fi

    # 启动应用
    if [[ "$DEV_MODE" == "true" ]]; then
        print_color "cyan" "以开发模式启动应用..."
        npm run dev &
    else
        print_color "cyan" "以生产模式启动应用..."
        npm start &
    fi

    local app_pid=$!

    # 等待服务器启动
    print_color "cyan" "等待服务器启动..."
    sleep 8

    # 检查服务器是否正在运行
    local max_attempts=10
    local attempt=0

    while [[ $attempt -lt $max_attempts ]]; do
        if curl -s "http://localhost:$port/health" >/dev/null 2>&1; then
            print_color "green" "✓ 应用启动成功!"
            print_color "cyan" "访问地址: http://localhost:$port"
            print_color "cyan" "健康检查: http://localhost:$port/health"
            return 0
        fi

        if ! kill -0 $app_pid 2>/dev/null; then
            print_color "red" "✗ 应用进程意外退出"
            return 1
        fi

        sleep 2
        ((attempt++))
    done

    print_color "yellow" "⚠️  应用可能正在启动中，请稍后访问 http://localhost:$port"
    return 0
}

# 显示使用帮助
show_help() {
    echo "CoinGlass 监控系统 macOS 一键部署脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -h, --help              显示此帮助信息"
    echo "  -d, --dev               以开发模式启动应用"
    echo "  -p, --port PORT         指定端口号 (默认: 3000)"
    echo "  --skip-node-install     跳过 Node.js 安装检查"
    echo "  --skip-chrome-check     跳过 Chrome 安装检查"
    echo ""
    echo "示例:"
    echo "  $0                     # 标准部署"
    echo "  $0 --dev               # 开发模式部署"
    echo "  $0 --port 8080         # 指定端口部署"
    echo ""
}

# 克隆项目仓库
clone_project() {
    print_color "cyan" "🔍 正在检查项目环境..."

    # 检查是否在项目目录中
    if [[ -f "package.json" ]]; then
        print_color "green" "✓ 已在项目目录中"
        return 0
    fi

    print_color "yellow" "未检测到项目文件，正在克隆仓库..."

    # 获取当前目录
    local current_dir=$(pwd)
    local project_path="$current_dir/$PROJECT_NAME"

    # 如果项目目录已存在，询问是否删除
    if [[ -d "$PROJECT_NAME" ]]; then
        print_color "yellow" "⚠️  项目目录 '$PROJECT_NAME' 已存在"
        read -p "是否删除现有目录并重新克隆? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            if rm -rf "$PROJECT_NAME"; then
                print_color "green" "✓ 已删除现有项目目录"
            else
                print_color "red" "✗ 删除现有目录失败"
                return 1
            fi
        else
            print_color "yellow" "请手动进入项目目录后重新运行脚本"
            return 1
        fi
    fi

    # 克隆仓库
    print_color "cyan" "正在从 GitHub 克隆仓库..."
    if git clone "$REPO_URL" "$PROJECT_NAME"; then
        if [[ -d "$PROJECT_NAME" ]]; then
            # 进入项目目录
            cd "$PROJECT_NAME"
            print_color "green" "✓ 项目克隆成功"
            print_color "cyan" "当前目录: $(pwd)"
            return 0
        else
            print_color "red" "✗ 项目克隆失败"
            return 1
        fi
    else
        print_color "red" "✗ Git 克隆失败"
        print_color "yellow" "可能的原因:"
        print_color "yellow" "  • 网络连接问题"
        print_color "yellow" "  • Git 未正确安装"
        print_color "yellow" "  • GitHub 访问受限"

        # 提供手动下载方案
        echo ""
        print_color "cyan" "替代方案: 手动下载项目"
        print_color "cyan" "1. 访问: https://github.com/techfanseric/coinglass-monitor"
        print_color "cyan" "2. 点击 'Code' -> 'Download ZIP'"
        print_color "cyan" "3. 解压到当前目录并重命名为 '$PROJECT_NAME'"
        print_color "cyan" "4. 重新运行此脚本"

        return 1
    fi
}

# 解析命令行参数
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -d|--dev)
                export DEV_MODE=true
                shift
                ;;
            -p|--port)
                export PORT="$2"
                shift 2
                ;;
            --skip-node-install)
                export SKIP_NODE_INSTALL=true
                shift
                ;;
            --skip-chrome-check)
                export SKIP_CHROME_CHECK=true
                shift
                ;;
            *)
                print_color "red" "未知选项: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# 设置默认变量
export REPO_URL="${REPO_URL:-https://github.com/techfanseric/coinglass-monitor.git}"
export PROJECT_NAME="${PROJECT_NAME:-coinglass-monitor}"

# 主执行流程
main() {
    print_color "cyan" "========================================"
    print_color "cyan" "  CoinGlass 监控系统 macOS 一键部署"
    print_color "cyan" "========================================"
    echo ""

    # 检查用户权限
    check_root

    # 检查网络连接
    check_network

    # 环境检查
    echo ""
    print_color "cyan" "🔍 正在检查系统环境..."
    echo ""

    check_macos_version
    install_homebrew
    install_nodejs
    install_git
    check_chrome

    # 克隆项目
    echo ""
    print_color "cyan" "🚀 正在准备项目文件..."
    echo ""

    clone_project

    # 项目初始化
    echo ""
    print_color "cyan" "⚙️  正在初始化项目..."
    echo ""

    initialize_project

    # 启动应用
    echo ""
    print_color "cyan" "🚀 正在启动应用..."
    echo ""

    start_application

    # 完成
    echo ""
    print_color "green" "========================================"
    print_color "green" "           部署完成!"
    print_color "green" "========================================"
    echo ""
    print_color "cyan" "应用信息:"
    local port=${PORT:-3000}
    echo "  • 访问地址: http://localhost:$port"
    echo "  • 配置文件: .env"
    echo "  • 数据目录: ./data/"
    echo "  • 日志文件: ./server.log"
    echo ""
    print_color "cyan" "常用命令:"
    echo "  • 停止应用: Ctrl+C 或 pkill -f 'node.*app.js'"
    echo "  • 开发模式: npm run dev"
    echo "  • 手动监控: npm run monitor"
    echo "  • 查看日志: tail -f ./server.log"
    echo ""
    print_color "yellow" "注意事项:"
    echo "  • 首次使用请配置 .env 文件中的 EmailJS 参数"
    echo "  • 请确保防火墙允许端口 $port 的访问"
    echo "  • 如需修改端口，请编辑 .env 文件中的 PORT 配置"
    echo ""
}

# 捕获中断信号
trap 'print_color "red" "部署被中断"; exit 1' INT TERM

# 解析命令行参数
parse_arguments "$@"

# 执行主函数
main