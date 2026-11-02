<?php
// Amelu colours on every page, after the skin's own CSS. On an organization's
// own webmail address (white-label webmail, docs/WEBMAIL.md) it takes on that
// organization's name, logo and colour instead, read from the Amelu API by
// hostname: nothing of Amelu shows there.
class amelu_theme extends rcube_plugin
{
    public $task = '.*';

    const SHARED_HOST = 'webmail.amelu.org';
    const CACHE_TTL = 60;
    // A 1x1 transparent GIF, for organizations without a logo.
    const NO_LOGO = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

    public function init()
    {
        $host = strtolower(preg_replace('/:\d+$/', '', (string) ($_SERVER['HTTP_HOST'] ?? '')));
        $brand = $host !== '' && $host !== self::SHARED_HOST ? $this->branding($host) : null;
        if (!$brand) {
            $this->include_stylesheet('amelu.css');
            return;
        }

        $rc = rcmail::get_instance();
        $name = trim((string) ($brand['productName'] ?? '')) ?: 'Webmail';
        $version = (int) ($brand['logoVersion'] ?? 0);
        $logo = !empty($brand['hasLogo']) ? '/__brand/logo?v=' . $version : self::NO_LOGO;

        $rc->config->set('product_name', $name);
        $rc->config->set('skin_logo', ['*' => $logo]);
        $rc->config->set('support_url', (string) ($brand['supportUrl'] ?? ''));
        $rc->config->set('display_product_info', 0);
        $rc->config->set('blankpage_url', !empty($brand['hasLogo']) ? '/__brand/watermark?v=' . $version : 'about:blank');

        $css = $this->colours((string) ($brand['accentColor'] ?? ''));
        $favicon = !empty($brand['hasLogo']) ? '<link rel="icon" href="/__brand/logo?v=' . $version . '">' : '';
        // AJAX requests get JSON output, which has no page head.
        if ($rc->output instanceof rcmail_output_html) {
            $rc->output->add_header($favicon . '<style>' . $css . '</style>');
        }
    }

    /** The organization's branding for this host, or null; cached a minute on disk. */
    private function branding(string $host): ?array
    {
        $file = sys_get_temp_dir() . '/amelu_brand_' . sha1($host) . '.json';
        if (is_file($file) && time() - filemtime($file) < self::CACHE_TTL) {
            $cached = json_decode((string) file_get_contents($file), true);
            return is_array($cached) && $cached ? $cached : null;
        }

        $api = rcmail::get_instance()->config->get('amelu_branding_api', 'https://api.amelu.org');
        $ctx = stream_context_create(['http' => ['timeout' => 3, 'ignore_errors' => true]]);
        $body = @file_get_contents($api . '/api/webmail-branding?host=' . rawurlencode($host), false, $ctx);
        $status = 0;
        foreach ($http_response_header ?? [] as $line) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $m)) {
                $status = (int) $m[1];
            }
        }
        if ($status === 200) {
            $brand = json_decode((string) $body, true);
            $brand = is_array($brand) ? $brand : [];
        } elseif ($status === 404) {
            $brand = [];
        } elseif (is_file($file)) {
            // The API is unreachable: keep the last answer rather than flashing Amelu's look.
            $cached = json_decode((string) file_get_contents($file), true);
            return is_array($cached) && $cached ? $cached : null;
        } else {
            return null;
        }
        @file_put_contents($file, json_encode($brand), LOCK_EX);
        return $brand ?: null;
    }

    /** amelu.css with the Amelu blue and its shades swapped for the organization's colour. */
    private function colours(string $accent): string
    {
        $css = (string) file_get_contents(__DIR__ . '/amelu.css');
        if (!preg_match('/^#[0-9a-f]{6}$/', $accent)) {
            return $css;
        }
        [$r, $g, $b] = sscanf($accent, '#%02x%02x%02x');
        $mix = function (array $to, float $amount) use ($r, $g, $b): string {
            return sprintf('#%02x%02x%02x',
                round($r + ($to[0] - $r) * $amount), round($g + ($to[1] - $g) * $amount), round($b + ($to[2] - $b) * $amount));
        };
        return str_ireplace(
            ['#0043ce', '#0051fe', 'rgba(0,67,206', 'rgba(0,81,254', '#0032a0', '#4d84ff', '#dfe6fb'],
            [$accent, $accent, "rgba($r,$g,$b", "rgba($r,$g,$b", $mix([0, 0, 0], 0.24), $mix([255, 255, 255], 0.3), $mix([255, 255, 255], 0.87)],
            $css
        );
    }
}
