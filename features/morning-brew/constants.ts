
import { MenuItem, UserProfile } from './types';

export const CATEGORIES = ['Todos', 'Populares', 'Barra Espresso', 'Cold Brew', 'Pastelería'];

export const MENU_ITEMS: MenuItem[] = [
  {
    id: '1',
    name: 'Caramel Macchiato',
    description: 'Espresso doble con leche vaporizada cremosa y nuestro característico toque de caramelo.',
    price: 5.50,
    image: 'https://images.unsplash.com/photo-1485808191679-5f86510681a2?q=80&w=800&auto=format&fit=crop',
    category: 'Barra Espresso',
    isPopular: true
  },
  {
    id: '2',
    name: 'Tostada de Aguacate',
    description: 'Aguacate maduro triturado a mano sobre pan de masa madre artesanal, con chili flakes y rábano.',
    price: 8.00,
    image: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?q=80&w=800&auto=format&fit=crop',
    category: 'Pastelería',
    isPopular: true
  },
  {
    id: '3',
    name: 'Nitro Cold Brew',
    description: 'Infusionado en frío durante 20 horas e inyectado con nitrógeno para una textura ultra sedosa.',
    price: 6.00,
    image: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?q=80&w=800&auto=format&fit=crop',
    category: 'Cold Brew',
    isPopular: false
  }
];

export const INITIAL_USER: UserProfile = {
  id: 'user_123',
  name: 'Jane Doe',
  email: 'jane.doe@morningbrew.co',
  // Fix: Added phone to initial user data
  phone: '+1 555-0123',
  points: 450,
  balance: 24.50,
  status: 'Plata',
  vouchers: [],
  avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=400&auto=format&fit=crop',
  onboardingCompleted: true,
  // Fix: Added orderHistory to initial user data to prevent crashes in ProfilePage
  orderHistory: [
    {
      id: 'ORD-8821',
      date: '12 Oct, 2023',
      items: 'Caramel Macchiato, Tostada de Aguacate',
      total: 13.50,
      pointsEarned: 135
    },
    {
      id: 'ORD-7742',
      date: '05 Oct, 2023',
      items: 'Nitro Cold Brew',
      total: 6.00,
      pointsEarned: 60
    }
  ]
};
