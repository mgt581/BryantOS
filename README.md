# BryantOS

Private place for notes, photos & documents, links and a Vault for passwords, API keys and codes.

- Live: https://mgt581.github.io/BryantOS/ (GitHub Pages, deploys from `main`)
- Sign-in and storage: Firebase project `bryant0s` (Google sign-in, Firestore, Storage)

## Files

| File | What it does |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | The app: side menu (computer) / bottom menu (phone), Home, Notes, Photos & docs, Links, Vault, Money/bills/dates, Settings |
| `vault.js` | Vault encryption (see below) |
| `signin.html`, `auth.js`, `firebase-init.js`, `firebase-config.js` | Google sign-in page |
| `crypto-js.min.js` | Only used once, to upgrade items from the old PIN Vault |
| `firestore.rules`, `storage.rules`, `firebase.json` | Security rules: each user can only reach their own data |

## Vault security

- A random 256-bit key encrypts each Vault item (AES-GCM) on the device before it is saved.
- That key is locked with your passphrase (PBKDF2-SHA256, 600,000 rounds). The passphrase can't be reset, so keep it written down somewhere safe.
- Face ID / fingerprint uses a passkey with the WebAuthn PRF extension, so the unlock secret stays in the phone's secure chip.
- Auto-locks after 5 minutes idle. Nothing that opens the Vault is stored in the browser.
- Notes, links, photos and lists are **not** encrypted; they're protected by Google sign-in and the Firebase rules.

## Try it locally

```bash
python3 -m http.server 5188
```

Then open http://localhost:5188/?demo to use a demo copy with no sign-in (stored only in that browser). `?demo` does nothing on the live site.

## Deploy the security rules

```bash
npx firebase-tools deploy --only firestore:rules,storage
```
