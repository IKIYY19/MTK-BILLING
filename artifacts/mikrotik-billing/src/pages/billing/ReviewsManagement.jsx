import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Star, TrendingUp, Award, Users, MessageSquare, Clock, Filter } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { getToken } from '../../lib/auth';

const API = import.meta.env.VITE_API_URL || '/api';

export function ReviewsManagement() {
  const toast = useToast();
  const [reviews, setReviews] = useState([]);
  const [staffPoints, setStaffPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('reviews');
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [staffHistory, setStaffHistory] = useState([]);

  useEffect(() => {
    fetchReviews();
    fetchStaffPoints();
  }, []);

  const fetchReviews = async () => {
    try {
      const token = getToken();
      const { data } = await axios.get(`${API}/billing/reviews`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setReviews(data);
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
      toast.error('Failed to load reviews', error.response?.data?.error || error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchStaffPoints = async () => {
    try {
      const token = getToken();
      const { data } = await axios.get(`${API}/billing/staff-points`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStaffPoints(data);
    } catch (error) {
      console.error('Failed to fetch staff points:', error);
      toast.error('Failed to load staff points', error.response?.data?.error || error.message);
    }
  };

  const fetchStaffHistory = async (userId) => {
    try {
      const token = getToken();
      const { data } = await axios.get(`${API}/billing/staff-points/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStaffHistory(data);
      setSelectedStaff(userId);
    } catch (error) {
      console.error('Failed to fetch staff history:', error);
      toast.error('Failed to load staff history', error.response?.data?.error || error.message);
    }
  };

  const getServiceQualityColor = (quality) => {
    const colors = {
      bad: 'bg-red-500/20 text-red-400',
      satisfactory: 'bg-yellow-500/20 text-yellow-400',
      good: 'bg-blue-500/20 text-blue-400',
      excellent: 'bg-green-500/20 text-green-400',
      over_expectation: 'bg-purple-500/20 text-purple-400',
    };
    return colors[quality] || 'bg-zinc-500/20 text-zinc-400';
  };

  const calculateAverageRating = () => {
    if (reviews.length === 0) {return 0;}
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    return (sum / reviews.length).toFixed(1);
  };

  const getRatingDistribution = () => {
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach(r => {
      distribution[r.rating] = (distribution[r.rating] || 0) + 1;
    });
    return distribution;
  };

  const distribution = getRatingDistribution();

  if (loading) {
    return <div className="p-8 text-zinc-400">Loading reviews...</div>;
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">Reviews & Staff Performance</h1>
        <p className="text-zinc-400">Monitor customer feedback and staff achievements</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('reviews')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'reviews'
              ? 'bg-blue-600 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:text-white'
          }`}
        >
          <Star className="w-4 h-4 inline mr-2" />
          Customer Reviews
        </button>
        <button
          onClick={() => setActiveTab('leaderboard')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'leaderboard'
              ? 'bg-blue-600 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:text-white'
          }`}
        >
          <Award className="w-4 h-4 inline mr-2" />
          Staff Leaderboard
        </button>
      </div>

      {activeTab === 'reviews' && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-sm">Total Reviews</span>
                <Star className="w-5 h-5 text-yellow-400" />
              </div>
              <div className="text-3xl font-bold text-white">{reviews.length}</div>
            </div>
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-sm">Average Rating</span>
                <TrendingUp className="w-5 h-5 text-green-400" />
              </div>
              <div className="text-3xl font-bold text-white">{calculateAverageRating()}</div>
            </div>
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-sm">5 Star Reviews</span>
                <Award className="w-5 h-5 text-purple-400" />
              </div>
              <div className="text-3xl font-bold text-white">{distribution[5]}</div>
            </div>
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-sm">Over Expectation</span>
                <Users className="w-5 h-5 text-cyan-400" />
              </div>
              <div className="text-3xl font-bold text-white">
                {reviews.filter(r => r.service_quality === 'over_expectation').length}
              </div>
            </div>
          </div>

          {/* Rating Distribution */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Rating Distribution</h3>
            <div className="space-y-3">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = distribution[star] || 0;
                const percentage = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
                return (
                  <div key={star} className="flex items-center gap-4">
                    <div className="flex items-center gap-1 w-20">
                      <Star className="w-4 h-4 text-yellow-400" />
                      <span className="text-white text-sm">{star} star</span>
                    </div>
                    <div className="flex-1 bg-zinc-800 rounded-full h-2">
                      <div
                        className="bg-yellow-400 h-2 rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-zinc-400 text-sm w-12 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Reviews List */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Recent Reviews</h3>
            {reviews.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">No reviews yet</div>
            ) : (
              <div className="space-y-4">
                {reviews.map((review) => (
                  <div key={review.id} className="bg-zinc-800 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="text-white font-medium">{review.customer_name}</div>
                        <div className="text-sm text-zinc-500">{review.customer_email}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-4 h-4 ${
                              star <= review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-zinc-600'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="mb-3">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${getServiceQualityColor(
                          review.service_quality
                        )}`}
                      >
                        {review.service_quality.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    {review.comment && (
                      <div className="bg-zinc-900/50 rounded p-3">
                        <p className="text-zinc-300 text-sm">{review.comment}</p>
                      </div>
                    )}
                    <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                      <Clock className="w-3 h-3" />
                      {new Date(review.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'leaderboard' && (
        <div className="space-y-6">
          {/* Leaderboard */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Award className="w-5 h-5 text-yellow-400" />
              Staff Points Leaderboard
            </h3>
            {staffPoints.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">No staff members yet</div>
            ) : (
              <div className="space-y-3">
                {staffPoints.map((staff, index) => (
                  <div
                    key={staff.id}
                    onClick={() => fetchStaffHistory(staff.id)}
                    className={`bg-zinc-800 rounded-lg p-4 cursor-pointer hover:bg-zinc-700 transition-colors ${
                      selectedStaff === staff.id ? 'ring-2 ring-blue-500' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                            index === 0
                              ? 'bg-yellow-500 text-white'
                              : index === 1
                              ? 'bg-gray-400 text-white'
                              : index === 2
                              ? 'bg-orange-600 text-white'
                              : 'bg-zinc-600 text-white'
                          }`}
                        >
                          {index + 1}
                        </div>
                        <div>
                          <div className="text-white font-medium">{staff.name}</div>
                          <div className="text-sm text-zinc-500">{staff.role}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-yellow-400">{staff.total_points}</div>
                        <div className="text-xs text-zinc-500">points</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Staff History */}
          {selectedStaff && (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-blue-400" />
                Point History
              </h3>
              {staffHistory.length === 0 ? (
                <div className="text-center py-8 text-zinc-500">No point history yet</div>
              ) : (
                <div className="space-y-3">
                  {staffHistory.map((entry) => (
                    <div key={entry.id} className="bg-zinc-800 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-white font-medium">{entry.reason}</div>
                        <div className={`text-lg font-bold ${entry.points > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {entry.points > 0 ? '+' : ''}{entry.points}
                        </div>
                      </div>
                      {entry.rating && (
                        <div className="flex items-center gap-2 mb-2">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`w-3 h-3 ${
                                star <= entry.rating ? 'text-yellow-400 fill-yellow-400' : 'text-zinc-600'
                              }`}
                            />
                          ))}
                          <span className="text-sm text-zinc-500 ml-2">{entry.customer_name}</span>
                        </div>
                      )}
                      <div className="text-xs text-zinc-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(entry.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
