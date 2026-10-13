/**
 * PDF Generation Utilities
 * Creates professional PDFs for invoices and receipts
 */

/**
 * Generate Invoice PDF as downloadable file
 */
export function generateInvoicePDF(invoice, customer) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 40px; color: #333; }
        .header { border-bottom: 3px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
        .logo { font-size: 24px; font-weight: bold; color: #2563eb; }
        .invoice-title { font-size: 32px; font-weight: bold; margin: 20px 0; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
        .info-box { background: #f8fafc; padding: 15px; border-radius: 8px; }
        .info-label { font-size: 12px; color: #64748b; margin-bottom: 5px; }
        .info-value { font-size: 14px; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th { background: #2563eb; color: white; padding: 12px; text-align: left; }
        td { padding: 12px; border-bottom: 1px solid #e2e8f0; }
        .total-row { font-size: 18px; font-weight: bold; background: #f8fafc; }
        .footer { margin-top: 40px; text-align: center; color: #64748b; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 20px; }
        .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
        .badge-paid { background: #dcfce7; color: #16a34a; }
        .badge-unpaid { background: #fee2e2; color: #dc2626; }
        .badge-partial { background: #dbeafe; color: #2563eb; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">ISP Billing System</div>
        <div class="invoice-title">INVOICE</div>
      </div>

      <div class="info-grid">
        <div class="info-box">
          <div class="info-label">Invoice Number</div>
          <div class="info-value">${invoice.invoice_number || 'N/A'}</div>
          <div class="info-label" style="margin-top: 10px;">Issue Date</div>
          <div class="info-value">${new Date(invoice.created_at).toLocaleDateString()}</div>
          <div class="info-label" style="margin-top: 10px;">Due Date</div>
          <div class="info-value">${new Date(invoice.due_date).toLocaleDateString()}</div>
        </div>
        <div class="info-box">
          <div class="info-label">Bill To</div>
          <div class="info-value">${customer.name}</div>
          <div style="font-size: 13px; color: #64748b;">
            ${customer.email || ''}<br>
            ${customer.phone || ''}<br>
            ${customer.address || ''}
          </div>
          <div style="margin-top: 10px;">
            <span class="badge ${invoice.status === 'paid' ? 'badge-paid' : invoice.status === 'partial' ? 'badge-partial' : 'badge-unpaid'}">
              ${invoice.status.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th style="text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${invoice.description || 'Monthly subscription fee'}</td>
            <td style="text-align: right;">KES ${parseFloat(invoice.amount || 0).toFixed(2)}</td>
          </tr>
          ${invoice.late_fee ? `
          <tr>
            <td>Late payment fee</td>
            <td style="text-align: right;">KES ${parseFloat(invoice.late_fee || 0).toFixed(2)}</td>
          </tr>
          ` : ''}
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td>Total Amount</td>
            <td style="text-align: right;">KES ${(parseFloat(invoice.amount || 0) + parseFloat(invoice.late_fee || 0)).toFixed(2)}</td>
          </tr>
          <tr>
            <td>Amount Paid</td>
            <td style="text-align: right; color: #16a34a;">KES ${parseFloat(invoice.paid_amount || 0).toFixed(2)}</td>
          </tr>
          <tr class="total-row">
            <td>Balance Due</td>
            <td style="text-align: right; color: #dc2626;">KES ${parseFloat(invoice.balance || parseFloat(invoice.amount || 0) - parseFloat(invoice.paid_amount || 0)).toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      <div class="footer">
        <p>Thank you for your business!</p>
        <p>For inquiries, contact: support@yourisp.com | +254 700 000 000</p>
      </div>

      <script>
        window.onload = function() { window.print(); };
      </script>
    </body>
    </html>
  `;

  const newWindow = window.open('', '_blank');
  newWindow.document.write(html);
  newWindow.document.close();
}

/**
 * Generate Receipt PDF
 */
export function generateReceiptPDF(payment, invoice, customer) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 40px; color: #333; }
        .header { border-bottom: 3px solid #16a34a; padding-bottom: 20px; margin-bottom: 30px; }
        .logo { font-size: 24px; font-weight: bold; color: #16a34a; }
        .title { font-size: 32px; font-weight: bold; margin: 20px 0; color: #16a34a; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
        .info-box { background: #f0fdf4; padding: 15px; border-radius: 8px; }
        .info-label { font-size: 12px; color: #64748b; margin-bottom: 5px; }
        .info-value { font-size: 14px; font-weight: 600; }
        .amount-box { background: linear-gradient(135deg, #16a34a, #22c55e); color: white; padding: 30px; border-radius: 12px; text-align: center; margin: 30px 0; }
        .amount-label { font-size: 14px; opacity: 0.9; }
        .amount-value { font-size: 48px; font-weight: bold; margin-top: 10px; }
        .footer { margin-top: 40px; text-align: center; color: #64748b; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 20px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
        th { background: #f8fafc; font-weight: 600; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">ISP Billing System</div>
        <div class="title">PAYMENT RECEIPT</div>
      </div>

      <div class="amount-box">
        <div class="amount-label">Amount Paid</div>
        <div class="amount-value">KES ${parseFloat(payment.amount || 0).toFixed(2)}</div>
      </div>

      <div class="info-grid">
        <div class="info-box">
          <div class="info-label">Receipt Number</div>
          <div class="info-value">${payment.reference || 'N/A'}</div>
          <div class="info-label" style="margin-top: 10px;">Payment Date</div>
          <div class="info-value">${new Date(payment.created_at).toLocaleDateString()} ${new Date(payment.created_at).toLocaleTimeString()}</div>
          <div class="info-label" style="margin-top: 10px;">Payment Method</div>
          <div class="info-value" style="text-transform: capitalize;">${payment.method || 'Cash'}</div>
        </div>
        <div class="info-box">
          <div class="info-label">Received From</div>
          <div class="info-value">${customer.name}</div>
          <div style="font-size: 13px; color: #64748b; margin-top: 5px;">
            ${customer.email || ''}<br>
            ${customer.phone || ''}
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Invoice Number</th>
            <th>Invoice Amount</th>
            <th>Amount Applied</th>
            <th>Remaining Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${invoice?.invoice_number || 'N/A'}</td>
            <td>KES ${parseFloat(invoice?.amount || 0).toFixed(2) || '0.00'}</td>
            <td>KES ${parseFloat(payment.amount || 0).toFixed(2)}</td>
            <td>KES ${(parseFloat(invoice?.balance || 0) - parseFloat(payment.amount || 0)).toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <div class="footer">
        <p>This is a computer-generated receipt and does not require a signature.</p>
        <p>For inquiries, contact: support@yourisp.com | +254 700 000 000</p>
      </div>

      <script>
        window.onload = function() { window.print(); };
      </script>
    </body>
    </html>
  `;

  const newWindow = window.open('', '_blank');
  newWindow.document.write(html);
  newWindow.document.close();
}
