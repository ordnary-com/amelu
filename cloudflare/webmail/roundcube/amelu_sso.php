<?php
/**
 * Amelu single sign-on: the dashboard's "Open in webmail" sends the browser
 * to /?_task=login&_sso=<token>, a payload signed by the Amelu API with the
 * shared secret (docs/WEBMAIL.md in the amelu repo). For a valid token the
 * plugin asks the mail cluster (as admin) for a fresh app password on that
 * mailbox and signs the browser in with it, so IMAP and SMTP run as the real
 * user and no mailbox password is involved. The app password is removed
 * again at logout; a stale one from an earlier session is replaced, so a
 * mailbox never carries more than one.
 */
class amelu_sso extends rcube_plugin
{
    public $task = '.*';

    const DESCRIPTION = 'Amelu webmail (dashboard sign-in)';

    private $sso_user;
    private $sso_pass;
    private $sso_app_id;

    public function init()
    {
        $this->add_hook('startup', [$this, 'startup']);
        $this->add_hook('authenticate', [$this, 'authenticate']);
        $this->add_hook('login_after', [$this, 'login_after']);
    }

    public function startup($args)
    {
        // Logging out: the session is still there at this point (logout_after runs
        // once it is gone), so this is where the app password is removed.
        if ($args['task'] === 'logout' && !empty($_SESSION['amelu_sso_app'])) {
            $this->destroy_app_password($_SESSION['amelu_sso_user'] ?? null, $_SESSION['amelu_sso_app']);
            unset($_SESSION['amelu_sso_app'], $_SESSION['amelu_sso_user']);
        }
        $token = rcube_utils::get_input_value('_sso', rcube_utils::INPUT_GET);
        if (!$token) {
            return $args;
        }
        $rcmail = rcmail::get_instance();
        $user = $this->verify($token);
        if (!$user) {
            rcube::raise_error(['code' => 403, 'message' => 'amelu_sso: invalid or expired token'], true, false);
            return $args;
        }
        // Already signed in, possibly as another mailbox: end that session first. The
        // cluster reuses ids, so the old app password must go before the new one exists.
        if (!empty($_SESSION['user_id'])) {
            $this->destroy_app_password($_SESSION['amelu_sso_user'] ?? null, $_SESSION['amelu_sso_app'] ?? null);
            $rcmail->kill_session();
        }
        try {
            [$id, $secret] = $this->issue_app_password($user);
        } catch (Exception $e) {
            rcube::raise_error(['code' => 500, 'message' => 'amelu_sso: ' . $e->getMessage()], true, false);
            return $args;
        }
        $this->sso_user = $user;
        $this->sso_pass = $secret;
        $this->sso_app_id = $id;
        $args['task'] = 'login';
        $args['action'] = 'login';
        return $args;
    }

    public function authenticate($args)
    {
        if ($this->sso_user) {
            $args['user'] = $this->sso_user;
            $args['pass'] = $this->sso_pass;
            $args['valid'] = true;
            $args['cookiecheck'] = false;
        }
        return $args;
    }

    public function login_after($args)
    {
        if ($this->sso_user) {
            $_SESSION['amelu_sso_user'] = $this->sso_user;
            $_SESSION['amelu_sso_app'] = $this->sso_app_id;
            $args['_task'] = 'mail';
        }
        return $args;
    }

    /** The mailbox address from a valid, unexpired token, or null. */
    private function verify($token)
    {
        $secret = rcmail::get_instance()->config->get('amelu_sso_secret');
        if (!$secret || substr_count($token, '.') !== 1) {
            return null;
        }
        [$encoded, $signature] = explode('.', $token, 2);
        $payload = base64_decode(strtr($encoded, '-_', '+/'));
        if ($payload === false || !hash_equals(hash_hmac('sha256', $payload, $secret), $signature)) {
            return null;
        }
        $claims = json_decode($payload, true);
        if (empty($claims['email']) || empty($claims['exp']) || $claims['exp'] < time()) {
            return null;
        }
        return strtolower($claims['email']);
    }

    // --- the cluster's JMAP admin API (Stalwart, x: methods) ---

    private function jmap($method, $args)
    {
        $config = rcmail::get_instance()->config;
        $client = rcmail::get_instance()->get_http_client(['timeout' => 10]);
        try {
            $response = $client->post(rtrim($config->get('amelu_sso_jmap_url'), '/') . '/jmap', [
                'auth' => [$config->get('amelu_sso_cid'), $config->get('amelu_sso_pw')],
                'headers' => ['Content-Type' => 'application/json'],
                // Encoded here, not with Guzzle's json option: a "\/" in the method name is refused by the cluster.
                'body' => json_encode([
                    'using' => ['urn:ietf:params:jmap:core', 'urn:stalwart:jmap'],
                    'methodCalls' => [[$method, (object) $args, 'c1']],
                ], JSON_UNESCAPED_SLASHES),
                'http_errors' => false,
            ]);
            $body = json_decode((string) $response->getBody(), true);
        } catch (Exception $e) {
            throw new Exception("mail cluster unreachable for $method: " . $e->getMessage());
        }
        if (empty($body['methodResponses'][0])) {
            throw new Exception("mail cluster did not answer $method (HTTP " . $response->getStatusCode() . '): '
                . substr((string) $response->getBody(), 0, 200));
        }
        [$name, $result] = $body['methodResponses'][0];
        if ($name === 'error') {
            throw new Exception("$method: " . ($result['type'] ?? 'error') . ' ' . ($result['description'] ?? ''));
        }
        return $result;
    }

    private function account_id($email)
    {
        [$local, $domain] = explode('@', $email, 2);
        $domains = $this->jmap('x:Domain/query', ['filter' => ['name' => $domain]]);
        if (empty($domains['ids'][0])) {
            throw new Exception("unknown domain $domain");
        }
        $accounts = $this->jmap('x:Account/query', ['filter' => ['name' => $local, 'domainId' => $domains['ids'][0]]]);
        if (empty($accounts['ids'][0])) {
            throw new Exception("unknown mailbox $email");
        }
        return $accounts['ids'][0];
    }

    /** Replaces any earlier SSO app password on the mailbox with a fresh one. */
    private function issue_app_password($email)
    {
        $account = $this->account_id($email);
        $existing = $this->jmap('x:AppPassword/get', ['accountId' => $account, 'ids' => null]);
        $stale = [];
        foreach ($existing['list'] ?? [] as $entry) {
            if (($entry['description'] ?? '') === self::DESCRIPTION) {
                $stale[] = $entry['id'];
            }
        }
        if ($stale) {
            $this->jmap('x:AppPassword/set', ['accountId' => $account, 'destroy' => $stale]);
        }
        $created = $this->jmap('x:AppPassword/set', ['accountId' => $account, 'create' => ['p0' => ['description' => self::DESCRIPTION]]]);
        if (empty($created['created']['p0']['secret'])) {
            throw new Exception('mail cluster refused to issue an app password');
        }
        return [$created['created']['p0']['id'], $created['created']['p0']['secret']];
    }

    private function destroy_app_password($email, $id)
    {
        if (!$email || !$id) {
            return;
        }
        try {
            $this->jmap('x:AppPassword/set', ['accountId' => $this->account_id($email), 'destroy' => [$id]]);
        } catch (Exception $e) {
            rcube::raise_error(['code' => 500, 'message' => 'amelu_sso: could not remove app password: ' . $e->getMessage()], true, false);
        }
    }
}
