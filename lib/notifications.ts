import { supabase } from './supabase';

export interface EmailPayload {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
}

export interface EmailResponse {
    success: boolean;
    data?: any;
    error?: string;
}

/**
 * Sends an email using the 'send-email' Supabase Edge Function.
 * Wraps the Supabase `invoke` call with error handling and typing.
 */
export const sendEmailNotification = async (payload: EmailPayload): Promise<EmailResponse> => {
    try {
        const { data, error } = await supabase.functions.invoke('send-email', {
            body: payload,
        });

        if (error) {
            console.error('Edge Function Invocation Error:', error);
            return { success: false, error: error.message || 'Failed to invoke email function' };
        }

        if (data?.error) {
            console.error('Email API Error:', data.error);
            return { success: false, error: JSON.stringify(data.error) };
        }

        return { success: true, data };
    } catch (err: any) {
        console.error('Unexpected Email Error:', err);
        return { success: false, error: err.message || 'Unknown network error' };
    }
};
