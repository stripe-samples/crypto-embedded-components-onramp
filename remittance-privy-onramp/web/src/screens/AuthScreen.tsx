import { PrimaryButton, SecondaryButton, TextField } from '../components/ui';

export function AuthScreen({
  authenticated,
  busy,
  code,
  codeSent,
  email,
  onCodeChange,
  onContinue,
  onEmailChange,
  onLogout,
  onSendCode,
  privyReady,
  signedInEmail,
}: {
  authenticated: boolean;
  busy: boolean;
  code: string;
  codeSent: boolean;
  email: string;
  onCodeChange: (value: string) => void;
  onContinue: () => void;
  onEmailChange: (value: string) => void;
  onLogout: () => void;
  onSendCode: () => void;
  privyReady: boolean;
  signedInEmail?: string;
}) {
  return (
    <section className="screen">
      <div className="kicker">Sender account</div>
      <h2>Sign in</h2>
      <p>Use Privy to sign in to the remittance app.</p>
      {authenticated && signedInEmail ? (
        <>
          <div className="summary-card">
            <span className="muted">Signed in with Privy</span>
            <strong>{signedInEmail}</strong>
          </div>
          <SecondaryButton disabled={busy} onClick={onLogout}>Sign out</SecondaryButton>
          <PrimaryButton loading={busy} onClick={onContinue}>Continue</PrimaryButton>
        </>
      ) : (
        <form className="form" onSubmit={(event) => event.preventDefault()}>
          <TextField
            disabled={codeSent || busy}
            label="Email"
            value={email}
            onChange={onEmailChange}
            placeholder="you@example.com"
            type="email"
          />
          {codeSent ? (
            <TextField
              label="Code"
              value={code}
              onChange={onCodeChange}
              placeholder="123456"
              inputMode="numeric"
            />
          ) : null}
          {codeSent ? (
            <PrimaryButton disabled={!privyReady} loading={busy} onClick={onContinue}>Continue</PrimaryButton>
          ) : (
            <PrimaryButton disabled={!privyReady} loading={busy} onClick={onSendCode}>Send code</PrimaryButton>
          )}
        </form>
      )}
    </section>
  );
}
