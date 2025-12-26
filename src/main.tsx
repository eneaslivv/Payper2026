
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '../App';
import '../index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error("Could not find root element to mount to");
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
    public state: { hasError: boolean, error: any };

    constructor(props: any) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: any) {
        return { hasError: true, error };
    }

    componentDidCatch(error: any, errorInfo: any) {
        console.error("Uncaught error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ color: 'white', padding: 20, background: '#111', height: '100vh', fontFamily: 'monospace' }}>
                    <h1>💥 CRITICAL APP CRASH</h1>
                    <p>The application encountered a fatal error.</p>
                    <pre style={{ color: '#f87171', background: '#333', padding: 10, overflow: 'auto' }}>
                        {this.state.error?.toString()}
                    </pre>
                    <button onClick={() => window.location.reload()} style={{ marginTop: 20, padding: 10 }}>RELOAD</button>
                </div>
            );
        }

        return this.props.children;
    }
}

const root = ReactDOM.createRoot(rootElement);
root.render(
    <React.StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </React.StrictMode>
);
