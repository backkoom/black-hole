#!/usr/bin/env bash
# ==============================================================================
# 自签证书 —— 内网没有 CA 时先把 HTTPS 跑起来，后面换正式证书只改两行路径。
#
# 用法：
#   sudo bash deploy/gen-selfsigned-cert.sh 192.168.102.102
#   sudo bash deploy/gen-selfsigned-cert.sh workbench.corp.local
#   sudo bash deploy/gen-selfsigned-cert.sh 192.168.102.102 --days 3650
#
# 产出：/etc/nginx/ssl/workbench.crt（含私钥的证书链不用，纯自签）
#       /etc/nginx/ssl/workbench.key（600）
#
# ⚠️ 自签证书浏览器会报「不安全」，用户要点「继续访问」。这是内网过渡方案，
#    正式验收前应换成企业 CA 或正式域名证书（换法见 README §3.4）。
# ==============================================================================
set -euo pipefail

HOST=${1:-}
SSL_DIR=${SSL_DIR:-/etc/nginx/ssl}
DAYS=825

while [[ $# -gt 0 ]]; do
  case "$1" in
    --days) DAYS=${2:-825}; shift 2 ;;
    --dir)  SSL_DIR=${2:-}; shift 2 ;;
    -*) echo "不认识参数 $1" >&2; exit 1 ;;
    *)  HOST=$1; shift ;;
  esac
done

[[ -n $HOST ]] || { echo "用法：bash $0 <域名或IP> [--days 825] [--dir /etc/nginx/ssl]" >&2; exit 1; }
[[ $EUID -eq 0 ]] || { echo "要 root（写 $SSL_DIR）" >&2; exit 1; }
command -v openssl >/dev/null || { echo "没装 openssl" >&2; exit 1; }

# 是 IPv4 就走 SAN=IP，否则 SAN=DNS。写错这一项 Chrome 会直接拒绝连接。
if [[ $HOST =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  SAN="IP:$HOST"
  CN="$HOST"
else
  SAN="DNS:$HOST"
  CN="$HOST"
fi

mkdir -p "$SSL_DIR"
chmod 700 "$SSL_DIR"

echo "生成自签证书：CN=$CN  SAN=$SAN  有效期 ${DAYS} 天"
openssl req -x509 -nodes -newkey rsa:2048 -sha256 \
  -days "$DAYS" \
  -keyout "$SSL_DIR/workbench.key" \
  -out    "$SSL_DIR/workbench.crt" \
  -subj   "/C=CN/O=Workbench/CN=$CN" \
  -addext "subjectAltName=$SAN" \
  -addext "keyUsage=critical,digitalSignature,keyEncipherment" \
  -addext "extendedKeyUsage=serverAuth" \
  2>/dev/null

chmod 600 "$SSL_DIR/workbench.key"
chmod 644 "$SSL_DIR/workbench.crt"

echo "完成："
openssl x509 -in "$SSL_DIR/workbench.crt" -noout -subject -dates -ext subjectAltName
echo
echo "接下来："
echo "  1) 确认 /etc/nginx/conf.d/workbench.conf 里 ssl_certificate 指向 $SSL_DIR/workbench.crt"
echo "  2) sudo nginx -t && sudo systemctl reload nginx"
echo "  3) /etc/workbench/api.env 里把 APP_ORIGIN 改成 https://$HOST、COOKIE_SECURE=true"
echo "  4) sudo systemctl restart workbench-api && bash /data/workbench/deploy/smoke.sh https://$HOST"
