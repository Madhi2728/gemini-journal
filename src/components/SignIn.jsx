export default function SignIn({ onSignIn }) {
  return (
    <div className="gate">
      <div className="gate-page">
        <p className="gate-date">A place to think out loud</p>
        <h1 className="gate-title">
          Write it down.<br />
          <em>Nobody else is reading.</em>
        </h1>
        <p className="gate-body">
          Talk something through with an AI companion, or write privately with
          encryption that happens on this device. Your entries are stored under
          your account alone.
        </p>
        <button className="primary" onClick={onSignIn}>
          Continue with Google
        </button>
      </div>
    </div>
  );
}
