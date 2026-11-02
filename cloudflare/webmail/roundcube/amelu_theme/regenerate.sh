set -e
cd /opt/amelu-webmail
mkdir -p plugins/amelu_theme
docker compose cp roundcube:/var/www/html/skins/elastic/styles/styles.min.css /tmp/elastic.min.css >/dev/null 2>&1
python3 - <<'PY'
import re
css=open("/tmp/elastic.min.css").read()
blocks=re.findall(r"([^{}]+)\{([^{}]*)\}", css)
out=[]
for sel,body in blocks:
    if "#37beff" in body.lower() or "rgba(55,190,255" in body.replace(" ",""):
        b=re.sub(r"#37beff", "#0043ce", body, flags=re.I)
        b=re.sub(r"rgba\(55,\s*190,\s*255", "rgba(0,67,206", b)
        # Dark mode: lighter blue for text, the brighter blue for fills, as in the 2.0 dashboard.
        decls=[]
        for d in b.split(";"):
            if d.strip().lower().startswith("color:"):
                d=d.replace("#0043ce","#4d84ff")
            else:
                d=d.replace("#0043ce","#0051fe").replace("rgba(0,67,206","rgba(0,81,254")
            decls.append(d)
        dark_body=";".join(decls)
        if "dark-mode" in sel:
            out.append(sel.strip()+"{"+dark_body+"}")
        else:
            out.append(sel.strip()+"{"+b+"}")
            dark_sel=",".join("html.dark-mode "+x.strip() for x in sel.strip().split(","))
            out.append(dark_sel+"{"+dark_body+"}")
extra="""
/* hover and focus shades, and dark mode, which Elastic derives from its main colour */
.btn-primary:hover,.btn-primary:focus,.btn-primary:not(:disabled):not(.disabled):active{background-color:#0032a0!important;border-color:#0032a0!important}
.btn-primary:focus,.btn-primary.focus{box-shadow:0 0 0 .2rem rgba(0,67,206,.35)!important}
.form-control:focus{border-color:#0043ce;box-shadow:0 0 0 .2rem rgba(0,67,206,.25)}
a:hover{color:#0032a0}
html.dark-mode .btn-primary{background-color:#0051fe;border-color:#0051fe}
html.dark-mode a{color:#4d84ff}

/* The left task bar: Amelu blue, white icons and text, the active item on the darker blue. */
#layout-menu,#layout-menu .popover-header,#taskmenu .special-buttons{background-color:#0043ce!important}
#taskmenu a,#taskmenu a:before,#taskmenu .action-buttons a{color:#fff!important}
#taskmenu a.selected,#taskmenu a.selected:hover,#taskmenu a:hover,#taskmenu a:focus,#taskmenu .action-buttons a:hover{color:#fff!important;background:#0032a0!important}
#taskmenu a.logout,#taskmenu a.logout:hover{color:#ffd1d1!important}
#layout-menu .popover-header img{filter:brightness(0) invert(1)}
html.dark-mode #layout-menu,html.dark-mode #layout-menu .popover-header,html.dark-mode #taskmenu .special-buttons{background-color:#0043ce!important}
html.dark-mode #taskmenu a,html.dark-mode #taskmenu .action-buttons a{color:#fff!important}
html.dark-mode #taskmenu a.selected,html.dark-mode #taskmenu a:hover,html.dark-mode #taskmenu a:focus{background-color:#0032a0!important}
html.dark-mode #layout-menu .popover-header img{opacity:1}
html.dark-mode #layout-menu{border-right:0!important}
/* No About entry in the task bar. */
#taskmenu a.about{display:none!important}
html.dark-mode #layout-menu .special-buttons a:not(:focus){background:transparent!important}
html.dark-mode #layout-menu .special-buttons a:hover{background:#0032a0!important}

/* Selected folder and selected messages: a soft Amelu tint next to the blue bar, not the same blue. */
ul.treelist li.selected>a,ul.treelist li.selected>div>a,.listing li.selected>a,.listing li.selected>div>a,.listing tr.selected td,.messagelist tr.selected td{color:#0043ce!important;background-color:#dfe6fb!important}
.messagelist tr.selected td a,.messagelist tr.selected td span,.messagelist tr.selected td .msgicon{color:#0043ce!important}
html.dark-mode ul.treelist li.selected>a,html.dark-mode ul.treelist li.selected>div>a,html.dark-mode .listing li.selected>a,html.dark-mode .listing li.selected>div>a,html.dark-mode .listing tr.selected td,html.dark-mode .messagelist tr.selected td{color:#fff!important;background-color:#374549!important}
html.dark-mode .messagelist tr.selected td a,html.dark-mode .messagelist tr.selected td span,html.dark-mode .messagelist tr.selected td .msgicon{color:#fff!important}
"""
header="/* Generated from skins/elastic/styles/styles.min.css: the Elastic main colour #37beff replaced by Amelu blue. Regenerate after a Roundcube upgrade, see docs/WEBMAIL.md. */\n"
open("plugins/amelu_theme/amelu.css","w").write(header+"\n".join(out)+extra)
print("rules recoloured:", len(out))
PY
# amelu_theme.php itself lives in the repo (cloudflare/webmail/roundcube/amelu_theme) and is not touched here.
python3 - <<'PY'
p="compose.yml"; s=open(p).read()
if "plugins/amelu_theme" not in s:
    s=s.replace("      - ./config/ordnary-mark.png:/var/www/html/skins/elastic/images/ordnary-mark.png:ro\n","      - ./config/ordnary-mark.png:/var/www/html/skins/elastic/images/ordnary-mark.png:ro\n      - ./plugins/amelu_theme:/var/www/html/plugins/amelu_theme:ro\n")
    s=s.replace("newmail_notifier\n","newmail_notifier,amelu_theme\n")
    open(p,"w").write(s)
print("compose has plugin:", "amelu_theme" in open(p).read())
PY
chmod -R a+rX plugins
docker compose up -d roundcube 2>&1 | tail -1
sleep 12
curl -sk https://127.0.0.1:8443/ | grep -o 'plugins/amelu_theme/amelu.css[^"]*' | head -1
curl -sk -o /dev/null -w "css: %{http_code}\n" https://127.0.0.1:8443/plugins/amelu_theme/amelu.css
docker compose logs roundcube --tail 5 | grep -i "error\|warn" | cut -c1-200 || true
