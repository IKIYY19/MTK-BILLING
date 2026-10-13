import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useToast } from '../hooks/useToast';
import {
  Check, ChevronRight, ChevronLeft, Building, Package,
  CreditCard, Router, Bell, PartyPopper, Upload
} from 'lucide-react';

const STEPS = ['Welcome', 'Company', 'Plans', 'Payments', 'Router', 'Notifications', 'Complete'];

export default function SetupWizard() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const [formData, setFormData] = useState({
    companyName: '',
    contactEmail: '',
    contactPhone: '',
    address: '',
    plans: [],
    paymentMethods: { cash: false, bank: false, mpesa: false, card: false },
    mpesa: { consumerKey: '', consumerSecret: '', shortcode: '', passkey: '' },
    router: { name: '', ip: '', port: 8728, username: '', password: '' },
    notifications: { sms: false, email: false, emailProvider: 'smtp', reminderDays: 3 },
  });

  const updateForm = (key, value) => setFormData(prev => ({ ...prev, [key]: value }));

  const handleComplete = async () => {
    setLoading(true);
    try {
      await api.post('/features/setup', formData);
      toast.success('Setup complete!');
      setStep(6);
    } catch (error) {
      console.error('Setup error:', error);
      toast.error('Setup failed', error.response?.data?.error || 'Please try again');
    } finally {
      setLoading(false);
    }
  };

  const skipStep = () => {
    if (step < 6) {setStep(step + 1);}
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-slate-900 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            {STEPS.map((s, i) => (
              <div key={s} className={`flex items-center ${i <= step ? 'text-blue-400' : 'text-gray-600'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  i < step ? 'bg-blue-600 text-white' : i === step ? 'bg-blue-600 text-white' : 'bg-gray-700'
                }`}>
                  {i < step ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                <span className="ml-2 text-xs hidden sm:inline">{s}</span>
              </div>
            ))}
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Content */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
          {step === 0 && (
            <div className="text-center">
              <PartyPopper className="w-16 h-16 text-blue-400 mx-auto mb-4" />
              <h1 className="text-3xl font-bold text-white mb-4">Welcome to MikroTik Billing!</h1>
              <p className="text-gray-400 mb-8">
                Let's set up your ISP management platform in just a few steps.
                This will configure your company info, service plans, and integrations.
              </p>
              <button
                onClick={() => setStep(1)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors"
              >
                Let's Get Started
              </button>
            </div>
          )}

          {step === 1 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <Building className="w-8 h-8 text-blue-400" />
                <h2 className="text-2xl font-bold text-white">Company Information</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Company Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.companyName}
                    onChange={e => updateForm('companyName', e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Company legal or trading name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Contact Email</label>
                  <input
                    type="email"
                    value={formData.contactEmail}
                    onChange={e => updateForm('contactEmail', e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="admin@yourisp.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Contact Phone</label>
                  <input
                    type="tel"
                    value={formData.contactPhone}
                    onChange={e => updateForm('contactPhone', e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="+254 700 000 000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Address</label>
                  <textarea
                    value={formData.address}
                    onChange={e => updateForm('address', e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Your office address"
                    rows={3}
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <Package className="w-8 h-8 text-blue-400" />
                <h2 className="text-2xl font-bold text-white">Service Plans</h2>
              </div>
              <p className="text-gray-400 mb-4">Set up your internet packages (you can edit these later)</p>
              <div className="space-y-4">
                {formData.plans.map((plan, idx) => (
                  <div key={idx} className="p-4 bg-white/5 border border-white/10 rounded-lg">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <input
                        type="text"
                        value={plan.name}
                        onChange={e => {
                          const plans = [...formData.plans];
                          plans[idx].name = e.target.value;
                          updateForm('plans', plans);
                        }}
                        className="px-3 py-2 bg-white/5 border border-white/10 rounded text-white text-sm"
                        placeholder="Plan name"
                      />
                      <input
                        type="text"
                        value={plan.speedUp}
                        onChange={e => {
                          const plans = [...formData.plans];
                          plans[idx].speedUp = e.target.value;
                          plans[idx].speedDown = e.target.value;
                          updateForm('plans', plans);
                        }}
                        className="px-3 py-2 bg-white/5 border border-white/10 rounded text-white text-sm"
                        placeholder="Speed (e.g., 10M)"
                      />
                      <input
                        type="number"
                        min="0"
                        value={plan.price}
                        onChange={e => {
                          const plans = [...formData.plans];
                          plans[idx].price = parseInt(e.target.value);
                          updateForm('plans', plans);
                        }}
                        className="px-3 py-2 bg-white/5 border border-white/10 rounded text-white text-sm"
                        placeholder="Price"
                      />
                      <input
                        type="number"
                        value={plan.quotaGb}
                        onChange={e => {
                          const plans = [...formData.plans];
                          plans[idx].quotaGb = e.target.value ? parseInt(e.target.value) : '';
                          updateForm('plans', plans);
                        }}
                        className="px-3 py-2 bg-white/5 border border-white/10 rounded text-white text-sm"
                        placeholder="GB (optional)"
                      />
                      <button
                        onClick={() => {
                          const plans = formData.plans.filter((_, i) => i !== idx);
                          updateForm('plans', plans);
                        }}
                        className="px-3 py-2 bg-red-600/20 text-red-400 rounded text-sm hover:bg-red-600/30"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => updateForm('plans', [...formData.plans, { name: '', speedUp: '', speedDown: '', price: '', quotaGb: '' }])}
                  className="w-full py-2 border-2 border-dashed border-gray-600 text-gray-400 rounded-lg hover:border-blue-500 hover:text-blue-400 transition-colors"
                >
                  + Add Plan
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <CreditCard className="w-8 h-8 text-blue-400" />
                <h2 className="text-2xl font-bold text-white">Payment Methods</h2>
              </div>
              <div className="space-y-4 mb-6">
                {Object.entries(formData.paymentMethods).map(([key, enabled]) => (
                  <label key={key} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-lg cursor-pointer hover:bg-white/10">
                    <span className="text-white capitalize">{key === 'mpesa' ? 'M-Pesa' : key}</span>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={e => updateForm('paymentMethods', { ...formData.paymentMethods, [key]: e.target.checked })}
                      className="w-5 h-5"
                    />
                  </label>
                ))}
              </div>
              {formData.paymentMethods.mpesa && (
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg space-y-3">
                  <h3 className="text-white font-semibold">M-Pesa Configuration</h3>
                  <input
                    type="text"
                    value={formData.mpesa.consumerKey}
                    onChange={e => updateForm('mpesa', { ...formData.mpesa, consumerKey: e.target.value })}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-white text-sm"
                    placeholder="Consumer Key"
                  />
                  <input
                    type="text"
                    value={formData.mpesa.consumerSecret}
                    onChange={e => updateForm('mpesa', { ...formData.mpesa, consumerSecret: e.target.value })}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-white text-sm"
                    placeholder="Consumer Secret"
                  />
                  <input
                    type="text"
                    value={formData.mpesa.shortcode}
                    onChange={e => updateForm('mpesa', { ...formData.mpesa, shortcode: e.target.value })}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-white text-sm"
                    placeholder="Shortcode"
                  />
                  <input
                    type="text"
                    value={formData.mpesa.passkey}
                    onChange={e => updateForm('mpesa', { ...formData.mpesa, passkey: e.target.value })}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-white text-sm"
                    placeholder="Passkey"
                  />
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <Router className="w-8 h-8 text-blue-400" />
                <h2 className="text-2xl font-bold text-white">Connect MikroTik Router</h2>
              </div>
              <p className="text-gray-400 mb-4">Optional - you can connect your router later from settings</p>
              <div className="space-y-4">
                <input
                  type="text"
                  value={formData.router.name}
                  onChange={e => updateForm('router', { ...formData.router, name: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Router name (e.g., Main Router)"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={formData.router.ip}
                    onChange={e => updateForm('router', { ...formData.router, ip: e.target.value })}
                    className="px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="IP Address"
                  />
                  <input
                    type="number"
                    value={formData.router.port}
                    onChange={e => updateForm('router', { ...formData.router, port: parseInt(e.target.value) })}
                    className="px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="API Port (8728)"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={formData.router.username}
                    onChange={e => updateForm('router', { ...formData.router, username: e.target.value })}
                    className="px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Username"
                  />
                  <input
                    type="password"
                    value={formData.router.password}
                    onChange={e => updateForm('router', { ...formData.router, password: e.target.value })}
                    className="px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Password"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <Bell className="w-8 h-8 text-blue-400" />
                <h2 className="text-2xl font-bold text-white">Notifications</h2>
              </div>
              <div className="space-y-4 mb-6">
                <label className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-lg cursor-pointer">
                  <span className="text-white">Enable SMS Notifications</span>
                  <input
                    type="checkbox"
                    checked={formData.notifications.sms}
                    onChange={e => updateForm('notifications', { ...formData.notifications, sms: e.target.checked })}
                    className="w-5 h-5"
                  />
                </label>
                <label className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-lg cursor-pointer">
                  <span className="text-white">Enable Email Notifications</span>
                  <input
                    type="checkbox"
                    checked={formData.notifications.email}
                    onChange={e => updateForm('notifications', { ...formData.notifications, email: e.target.checked })}
                    className="w-5 h-5"
                  />
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Payment Reminder (days before due)</label>
                <input
                  type="number"
                  value={formData.notifications.reminderDays}
                  onChange={e => updateForm('notifications', { ...formData.notifications, reminderDays: parseInt(e.target.value) })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min={1}
                  max={30}
                />
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="text-center">
              <PartyPopper className="w-20 h-20 text-green-400 mx-auto mb-4" />
              <h1 className="text-3xl font-bold text-white mb-4">You're All Set! 🎉</h1>
              <p className="text-gray-400 mb-8">
                Your MikroTik Billing platform is ready to use.
                Start adding customers and managing your ISP!
              </p>
              <button
                onClick={() => navigate('/')}
                className="bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors"
              >
                Go to Dashboard
              </button>
            </div>
          )}

          {/* Navigation */}
          {step > 0 && step < 6 && (
            <div className="flex justify-between mt-8 pt-6 border-t border-white/10">
              <button
                onClick={() => setStep(step - 1)}
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              {step < 5 ? (
                <button
                  onClick={skipStep}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleComplete}
                  disabled={loading}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
                >
                  {loading ? 'Saving...' : 'Complete Setup'}
                  <Check className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
