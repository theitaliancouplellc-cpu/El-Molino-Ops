'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Search, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Category = {
  id: string;
  name: string;
  sort_order: number | null;
  verified: boolean;
  source: string | null;
};

type MenuItem = {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  base_price: number | null;
  price_source: string | null;
  verified: boolean;
  verification_note: string | null;
  active: boolean;
};

export default function MenuPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void loadMenu();
  }, []);

  async function loadMenu() {
    setLoading(true);
    setMessage('');
    const [{ data: categoryData, error: categoryError }, { data: itemData, error: itemError }] = await Promise.all([
      supabase.from('menu_categories').select('id,name,sort_order,verified,source').order('sort_order', { ascending: true }),
      supabase.from('menu_items').select('id,category_id,name,description,base_price,price_source,verified,verification_note,active').order('name'),
    ]);

    if (categoryError || itemError) {
      setMessage(categoryError?.message || itemError?.message || 'Could not load menu catalog.');
    }

    setCategories((categoryData ?? []) as Category[]);
    setItems((itemData ?? []) as MenuItem[]);
    setLoading(false);
  }

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      item.name.toLowerCase().includes(q) ||
      (item.description ?? '').toLowerCase().includes(q) ||
      (item.price_source ?? '').toLowerCase().includes(q)
    );
  }, [items, query]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a href="/" className="avatar" aria-label="Back to app"><ArrowLeft size={20} /></a>
        <div style={{ flex: 1, marginLeft: 12 }}>
          <div className="brand-kicker">El Molino Taqueria</div>
          <div className="brand-title">Menu Catalog</div>
        </div>
      </header>

      <main className="page">
        <section className="hero" style={{ marginBottom: 16 }}>
          <div className="hero-row">
            <div>
              <div className="brand-kicker" style={{ color: '#b8cabc' }}>Structured knowledge</div>
              <h1 style={{ fontSize: 'clamp(2.2rem, 10vw, 4.5rem)' }}>Products you can verify.</h1>
              <p>Public menu research lives here as structured data. Nothing becomes an official internal menu fact until it is verified.</p>
            </div>
            <div className="hero-badge">{categories.length} categories • {items.length} items</div>
          </div>
        </section>

        <div className="card" style={{ marginBottom: 14 }}>
          <div className="field">
            <label>Search menu</label>
            <div style={{ position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: 14, top: 14, opacity: .55 }} />
              <input
                className="input"
                style={{ paddingLeft: 42 }}
                placeholder="Search burrito, birria, taco..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        {message && <div className="notice error" style={{ marginBottom: 12 }}>{message}</div>}
        {loading && <div className="notice">Loading menu catalog…</div>}

        {!loading && categories.map((category) => {
          const categoryItems = filteredItems.filter((item) => item.category_id === category.id);
          if (query && categoryItems.length === 0) return null;

          return (
            <section key={category.id} style={{ marginBottom: 20 }}>
              <div className="section-title">
                <h2>{category.name}</h2>
                <span>{categoryItems.length} items</span>
              </div>

              {categoryItems.length === 0 ? (
                <div className="card">
                  <div className="list-main">
                    <b>Category captured</b>
                    <small>No structured items have been imported into this category yet.</small>
                  </div>
                </div>
              ) : (
                <div className="list">
                  {categoryItems.map((item) => (
                    <div className="list-item" key={item.id} style={{ alignItems: 'flex-start' }}>
                      <div className="icon-wrap">
                        {item.verified ? <CheckCircle2 size={18} /> : <ShieldAlert size={18} />}
                      </div>
                      <div className="list-main">
                        <b>{item.name}</b>
                        {item.description && <small>{item.description}</small>}
                        <small>{item.verified ? 'Verified internal record' : 'Public research — verify in Toast / in-store'}</small>
                        {item.price_source && <small>Source: {item.price_source}</small>}
                      </div>
                      <div style={{ textAlign: 'right', minWidth: 72 }}>
                        <div style={{ fontWeight: 800 }}>{item.base_price != null ? `$${Number(item.base_price).toFixed(2)}` : '—'}</div>
                        <span className="status">{item.verified ? 'verified' : 'draft'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}

        {!loading && filteredItems.filter((item) => !item.category_id).length > 0 && (
          <section>
            <div className="section-title"><h2>Uncategorized</h2><span>needs review</span></div>
            <div className="list">
              {filteredItems.filter((item) => !item.category_id).map((item) => (
                <div className="list-item" key={item.id}>
                  <div className="list-main"><b>{item.name}</b><small>{item.description || 'No description yet.'}</small></div>
                  <div style={{ fontWeight: 800 }}>{item.base_price != null ? `$${Number(item.base_price).toFixed(2)}` : '—'}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
