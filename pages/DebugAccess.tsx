import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const DebugAccess: React.FC = () => {
    const { user, profile, isLoading, hasPermission, permissions } = useAuth();
    const navigate = useNavigate();
    const [currentTime, setCurrentTime] = useState(new Date().toISOString());

    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(new Date().toISOString()), 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="min-h-screen bg-black text-white p-10 font-mono text-xs">
            <h1 className="text-2xl font-bold text-neon mb-4">DEBUG ACCESS PANEL</h1>
            <p className="mb-4">Current Time: {currentTime}</p>

            <div className="grid grid-cols-2 gap-4">
                <div className="border border-white/20 p-4 rounded">
                    <h2 className="text-xl font-bold mb-2">AUTH STATE</h2>
                    <pre className="whitespace-pre-wrap text-green-400">
                        {JSON.stringify({
                            isLoading,
                            userId: user?.id || 'null',
                            email: user?.email || 'null',
                            profileId: profile?.id || 'null',
                            role: profile?.role || 'null',
                            storeId: profile?.store_id || 'null',
                            isActive: profile?.is_active,
                        }, null, 2)}
                    </pre>
                </div>

                <div className="border border-white/20 p-4 rounded">
                    <h2 className="text-xl font-bold mb-2">PERMISSIONS</h2>
                    <div className="mb-4">
                        <strong>Store Owner Check:</strong> {profile?.role === 'store_owner' ? 'YES (Should Bypass)' : 'NO'}
                    </div>
                    <div className="mb-4">
                        <strong>Has Permission 'staff'?</strong> {hasPermission('staff') ? 'YES' : 'NO'}
                    </div>
                    <pre className="whitespace-pre-wrap text-yellow-400">
                        {JSON.stringify(permissions, null, 2)}
                    </pre>
                </div>
            </div>

            <div className="mt-8 border border-red-500/50 p-4 rounded bg-red-900/10">
                <h3 className="text-lg font-bold text-red-500 mb-2">Routing Tests</h3>
                <div className="flex gap-4">
                    <button onClick={() => navigate('/settings')} className="bg-red-500 text-white px-4 py-2 rounded">
                        Go to /settings
                    </button>
                    <button onClick={() => navigate('/inventory')} className="bg-blue-500 text-white px-4 py-2 rounded">
                        Go to /inventory
                    </button>
                    <button onClick={() => navigate('/')} className="bg-gray-500 text-white px-4 py-2 rounded">
                        Go to Dashboard
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DebugAccess;
