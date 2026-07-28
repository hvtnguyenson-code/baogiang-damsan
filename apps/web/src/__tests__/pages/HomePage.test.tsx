import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from '../../pages/HomePage';

/**
 * Unit tests for HomePage.
 */
describe('HomePage', () => {
  function renderHomePage() {
    return render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <HomePage />
      </MemoryRouter>,
    );
  }

  it('should render the system name', () => {
    renderHomePage();
    // The app name should be visible
    expect(
      screen.getByText(/hệ thống báo giảng đam san/i),
    ).toBeInTheDocument();
  });

  it('should render the school name', () => {
    renderHomePage();
    expect(
      screen.getByText(/trường ptdtnt thpt đam san/i),
    ).toBeInTheDocument();
  });

  it('should display Phase 00 notice', () => {
    renderHomePage();
    expect(screen.getAllByText(/phase 00/i).length).toBeGreaterThan(0);
  });

  it('should have a link to system status page', () => {
    renderHomePage();
    const link = screen.getByRole('link', { name: /xem trạng thái hệ thống/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/system-status');
  });

  it('should NOT display any role selector', () => {
    renderHomePage();
    // No role selector should exist
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/vai trò/i)).not.toBeInTheDocument();
  });

  it('should NOT display business data tables or forms', () => {
    renderHomePage();
    // No tables, no form controls for business data should exist
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText(/danh sách tiết dạy/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/bảng kê tuần/i)).not.toBeInTheDocument();
  });
});
