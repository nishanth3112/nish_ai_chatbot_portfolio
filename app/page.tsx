export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        fontFamily: "Arial, sans-serif",
        background: "#f5f7fb",
        color: "#14213d",
      }}
    >
      <div
        style={{
          maxWidth: "640px",
          width: "100%",
          background: "#ffffff",
          border: "1px solid #d9e1ec",
          borderRadius: "16px",
          padding: "24px",
          boxShadow: "0 10px 30px rgba(20, 33, 61, 0.08)",
        }}
      >
        <h1 style={{ margin: "0 0 12px", fontSize: "28px" }}>
          NishAI Backend
        </h1>
        <p style={{ margin: "0 0 16px", lineHeight: 1.6 }}>
          The backend service is running.
        </p>
        <p style={{ margin: "0 0 8px", lineHeight: 1.6 }}>
          Health endpoint: <code>/api/health</code>
        </p>
        <p style={{ margin: 0, lineHeight: 1.6 }}>
          Chat endpoint: <code>/api/chat</code>
        </p>
      </div>
    </main>
  );
}
