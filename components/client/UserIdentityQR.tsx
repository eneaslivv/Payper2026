import QRCode from "react-qr-code";

interface UserIdentityQRProps {
    userCode: string; // UUID o customer_code del usuario
    userName: string;
}

/**
 * QR estático de identidad del usuario.
 * Se usa para que el staff escanee y pueda cargar saldo a la billetera.
 */
export const UserIdentityQR = ({ userCode, userName }: UserIdentityQRProps) => {
    if (!userCode) {
        return (
            <div className="p-6 bg-gray-100 rounded-2xl text-center">
                <p className="text-gray-500 text-sm">Código no disponible</p>
            </div>
        );
    }

    return (
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-[#36e27b]/20 flex flex-col items-center gap-5 relative overflow-hidden">
            {/* Barra decorativa superior */}
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#36e27b] to-[#2dd4bf]" />

            <div className="text-center space-y-1 mt-2">
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Mi Pasaporte</h2>
                <h3 className="text-xl font-black text-gray-900">{userName}</h3>
            </div>

            <div className="p-4 bg-white rounded-xl border-4 border-gray-900 shadow-sm">
                <QRCode
                    value={userCode}
                    size={180}
                    viewBox="0 0 256 256"
                    fgColor="#111827"
                />
            </div>

            <div className="text-center space-y-2">
                <p className="text-sm font-medium text-gray-500">
                    Muestra este código para cargar saldo
                </p>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#36e27b]/10 text-[#36e27b] text-xs font-bold rounded-full border border-[#36e27b]/30">
                    <span className="material-symbols-outlined text-base">verified_user</span>
                    Código de Identidad
                </div>
            </div>
        </div>
    );
};

export default UserIdentityQR;
