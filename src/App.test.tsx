import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('Agendamentos', () => {
  it('mostra o pipeline completo e os filtros compartilhados', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Todos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Robson' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gisele' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ideias' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Planejado' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Em andamento' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Aguardando / Dependência' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Finalizado' })).toBeInTheDocument();
  });

  it('interpreta uma entrada rápida e mostra a prévia', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByPlaceholderText(/o que você quer fazer/i), 'Terminar OLX até quinta, difícil, 4 horas');
    await user.click(screen.getByRole('button', { name: /interpretar/i }));
    expect(await screen.findByText(/4h/)).toBeInTheDocument();
    expect(screen.getByText(/difícil/i)).toBeInTheDocument();
  });
});
