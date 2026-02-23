#!/bin/bash
# ============================================
#  deploy.sh — Один скрипт для всього
# ============================================
#  Запуск:  ./deploy.sh "опис змін"
#  Або:     ./deploy.sh
# ============================================

REPO_DIR="$HOME/Documents/Repositories/oleksandr-site"
DOWNLOADS="$HOME/Downloads"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  🚀 Deploy oleksandr-site${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

cd "$REPO_DIR" || { echo -e "${RED}❌ Папка $REPO_DIR не знайдена${NC}"; exit 1; }

# ===== Створюємо структуру якщо не існує =====
mkdir -p blog/yak-obrati-rozrobnyka
mkdir -p blog/react-vs-tilda
mkdir -p projects/agentis
mkdir -p public/images
mkdir -p api

# ===== Маппінг: що звідки куди =====
declare -A FILES=(
  # Кореневі файли
  ["index.html"]="index.html"
  ["sitemap.xml"]="sitemap.xml"
  ["robots.txt"]="robots.txt"
  ["update.sh"]="update.sh"
  ["deploy.sh"]="deploy.sh"
  ["worker.js"]="api/send-chat.js"

  # Блог та проєкти (з підпапок Downloads)
  ["blog-yak-obrati/index.html"]="blog/yak-obrati-rozrobnyka/index.html"
  ["blog-react-vs-tilda/index.html"]="blog/react-vs-tilda/index.html"
  ["projects-agentis/index.html"]="projects/agentis/index.html"
)

COPIED=0
SKIPPED=0

echo -e "${GREEN}📂 Шукаю файли в Downloads...${NC}"
echo ""

for src_rel in "${!FILES[@]}"; do
  src_file="$DOWNLOADS/$src_rel"
  dst_file="$REPO_DIR/${FILES[$src_rel]}"

  if [ -f "$src_file" ]; then
    # Свіжий = змінений за останні 4 години
    if [ "$(find "$src_file" -mmin -240 2>/dev/null)" ]; then
      mkdir -p "$(dirname "$dst_file")"
      cp "$src_file" "$dst_file"
      echo -e "  ${GREEN}✓${NC} ${FILES[$src_rel]}"
      COPIED=$((COPIED + 1))
    else
      echo -e "  ${YELLOW}⏭${NC} ${FILES[$src_rel]} (старий)"
      SKIPPED=$((SKIPPED + 1))
    fi
  fi
done

# ZIP — розпаковуємо якщо є свіжий
ZIP_FILE="$DOWNLOADS/oleksandr-site-full.zip"
if [ -f "$ZIP_FILE" ] && [ "$(find "$ZIP_FILE" -mmin -240 2>/dev/null)" ]; then
  echo ""
  echo -e "${GREEN}📦 Знайдено ZIP — розпаковую...${NC}"
  cd /tmp
  rm -rf oleksandr-site-unzip
  unzip -qo "$ZIP_FILE" -d oleksandr-site-unzip

  # Копіюємо все крім images і .git
  cd oleksandr-site-unzip/oleksandr-site 2>/dev/null || cd oleksandr-site-unzip
  find . -type f ! -path '*/public/images/*' ! -path '*/.git/*' | while read -r f; do
    dst="$REPO_DIR/$f"
    mkdir -p "$(dirname "$dst")"
    cp "$f" "$dst"
    echo -e "  ${GREEN}✓${NC} $f (з ZIP)"
    COPIED=$((COPIED + 1))
  done

  rm -rf /tmp/oleksandr-site-unzip
fi

cd "$REPO_DIR"

echo ""
echo -e "${GREEN}📊 Статус:${NC} $COPIED файлів скопійовано"
echo ""

# ===== Перевіряємо що є в репо =====
echo -e "${CYAN}📁 Структура сайту:${NC}"
echo ""
find . -name "*.html" -o -name "*.xml" -o -name "*.txt" -o -name "*.js" -o -name "*.json" -o -name "*.sh" -o -name "*.jpg" -o -name "*.png" | grep -v node_modules | grep -v .git | sort | while read -r f; do
  SIZE=$(du -h "$f" 2>/dev/null | cut -f1)
  echo -e "  ${CYAN}│${NC} $f ${YELLOW}($SIZE)${NC}"
done
echo ""

# ===== Git =====
# Додаємо нові файли до трекінгу
git add .

# Перевіряємо чи є зміни
if git diff --cached --quiet && git diff --quiet; then
  echo -e "${YELLOW}⚠️  Немає змін для комміту${NC}"
  echo -e "   Файли ідентичні тому що в репо."
  exit 0
fi

echo -e "${GREEN}📝 Зміни:${NC}"
git status --short
echo ""

COMMIT_MSG="${1:-update from Claude $(date +%H:%M)}"

echo -e "${GREEN}📦 Коммічу і пушу...${NC}"
git commit -m "$COMMIT_MSG"
git push

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✅ Задеплоєно!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Коміт:  ${YELLOW}$COMMIT_MSG${NC}"
echo -e "  Vercel: ${CYAN}~30 сек до оновлення${NC}"
echo -e "  Сайт:   ${CYAN}https://www.parkinsandr.tech${NC}"
echo ""
