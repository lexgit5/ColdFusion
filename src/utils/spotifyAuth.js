const CLIENT_ID = 'c053af2ce092429e87d6ffd4c8f23ba1'; // same one from AuthButton.jsx
const REDIRECT_URL = 'http://127.0.0.1:8788/callback';
const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';

async function exchangeCodeForToken(code) {
  const verifier = localStorage.getItem('pkce_verifier');

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: REDIRECT_URL,
    code_verifier: verifier,
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!response.ok) {
    throw new Error('Token exchange failed');
  }

  const data = await response.json();
  return data.access_token;
}

export { exchangeCodeForToken };