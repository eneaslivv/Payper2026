
import React, { useState } from 'react';
import { MOCK_RECIPES, MOCK_INVENTORY } from '../constants';
import { Recipe, InventoryItem } from '../types';

const RecipeManagement: React.FC = () => {
  const [recipes, setRecipes] = useState<Recipe[]>(MOCK_RECIPES);

  const calculateMaxProduction = (recipe: Recipe) => {
    const limits = recipe.items.map(item => {
      const ingredient = MOCK_INVENTORY.find(i => i.id === item.ingredient_id);
      if (!ingredient) return 0;
      return Math.floor(ingredient.current_stock / item.quantity_required);
    });
    return Math.min(...limits);
  };

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary font-bold text-sm uppercase tracking-wider">
            <span className="material-symbols-outlined text-[18px]">menu_book</span>
            Libro de Recetas (BOM)
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-text-main dark:text-white tracking-tight">Estructura de Productos</h1>
          <p className="text-text-secondary text-base">Define los ingredientes y cantidades que consume cada venta.</p>
        </div>
        <button className="flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-white font-bold text-sm shadow-lg shadow-primary/30 hover:bg-primary-dark transition-all">
          <span className="material-symbols-outlined text-[20px]">add</span>
          <span>Crear Receta</span>
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {recipes.map(recipe => {
          const finalProduct = MOCK_INVENTORY.find(i => i.id === recipe.final_product_id);
          const maxProduction = calculateMaxProduction(recipe);

          return (
            <div key={recipe.id} className="bg-white dark:bg-[#2a1a1a] rounded-2xl border border-border-color shadow-sm overflow-hidden flex flex-col">
              <div className="p-6 flex items-start justify-between border-b border-border-color">
                <div className="flex items-center gap-4">
                  <img src={finalProduct?.image_url} className="size-16 rounded-xl object-cover" />
                  <div>
                    <h3 className="text-xl font-black">{finalProduct?.name}</h3>
                    <p className="text-sm text-text-secondary">Rinde: {recipe.yield_quantity} {finalProduct?.unit_type}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-text-secondary uppercase">Capacidad Actual</p>
                  <p className={`text-2xl font-black ${maxProduction < 5 ? 'text-primary' : 'text-green-600'}`}>
                    {maxProduction} <span className="text-xs">un.</span>
                  </p>
                </div>
              </div>
              
              <div className="p-6 flex-1 space-y-4">
                <h4 className="text-xs font-bold text-text-secondary uppercase tracking-widest">Ingredientes Necesarios</h4>
                <div className="space-y-3">
                  {recipe.items.map((item, idx) => {
                    const ing = MOCK_INVENTORY.find(i => i.id === item.ingredient_id);
                    const hasStock = ing && ing.current_stock >= item.quantity_required;
                    return (
                      <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-background-light dark:bg-white/5 border border-transparent">
                        <div className="flex items-center gap-3">
                          <div className={`size-2 rounded-full ${hasStock ? 'bg-green-500' : 'bg-primary'}`}></div>
                          <span className="text-sm font-bold">{ing?.name}</span>
                        </div>
                        <span className="text-sm font-black">{item.quantity_required} {item.unit_type}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="p-4 bg-primary/5 border-t border-primary/10 flex justify-between items-center">
                <p className="text-xs text-primary font-bold">Costo estimado: $1.45</p>
                <div className="flex gap-2">
                  <button className="p-2 text-text-secondary hover:text-primary transition-colors">
                    <span className="material-symbols-outlined">edit</span>
                  </button>
                  <button className="p-2 text-text-secondary hover:text-primary transition-colors">
                    <span className="material-symbols-outlined">visibility</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-8 bg-blue-50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/20 flex items-center gap-6">
        <span className="material-symbols-outlined text-blue-500 text-4xl">lightbulb</span>
        <div>
          <h4 className="text-lg font-bold text-blue-900 dark:text-blue-300">Optimizador de Producción</h4>
          <p className="text-sm text-blue-800 dark:text-blue-400 leading-relaxed max-w-3xl">
            El sistema detecta que el insumo <b>Leche Entera 1L</b> es el limitante para tu producto estrella. 
            Si compras 10 unidades más, tu capacidad de venta diaria aumentará un 45%.
          </p>
        </div>
      </div>
    </div>
  );
};

export default RecipeManagement;
