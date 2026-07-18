import { generateCodeVerifier, generateCodeChallenge } from '../utils/pkce'

const CLIENT_ID = 'c053af2ce092429e87d6ffd4c8f23ba1';
const REDIRECT_URL = 'http://127.0.0.1:5173/callback';
const SCOPES = 'streaming user-read-email user-read-private playlist-read-private playlist-read-collaborative';

function AuthButton() {
  async function handleLogin() {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);

    localStorage.setItem('pkce_verifier', verifier);

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URL,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      scope: SCOPES,
    });

    window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
  }

  return <button onClick={handleLogin}>Connect to Spotify</button>;
}

export default AuthButton;