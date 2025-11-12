from flask import Flask, jsonify, render_template, send_file, request, session
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from flask_socketio import SocketIO, emit
from flask_caching import Cache
from flask_babel import Babel, _
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flasgger import Swagger
import pandas as pd
import io
import json
from datetime import datetime, timedelta
import logging
from functools import wraps

# Initialize extensions
app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///mobile_booth.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['BABEL_DEFAULT_LOCALE'] = 'en'
app.config['CACHE_TYPE'] = 'SimpleCache'
app.config['CACHE_DEFAULT_TIMEOUT'] = 300

# Initialize extensions
db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'
socketio = SocketIO(app, cors_allowed_origins="*")
cache = Cache(app)
babel = Babel(app)
# Limiter setup (Flask-Limiter >=3.0)
limiter = Limiter(key_func=get_remote_address)
limiter.init_app(app)
swagger = Swagger(app)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Service limits configuration
SERVICE_LIMITS = {
    'Airtel Money': 350000.00,
    'FNB': 80000.00,
    'MTN Money': 160000.00,
    'Zamtel Money': 70000.00,
    'Zanaco': 80000.00
}

# Database Models
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(120), nullable=False)
    role = db.Column(db.String(20), default='viewer')  # admin, manager, viewer
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Transaction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    mobile_booth = db.Column(db.String(50), nullable=False)
    service = db.Column(db.String(50), nullable=False)
    transaction_amount = db.Column(db.Float, nullable=False)
    revenue_per_kwacha = db.Column(db.Float, nullable=False)
    revenue = db.Column(db.Float, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Alert(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    type = db.Column(db.String(50), nullable=False)  # revenue, service_limit, performance
    message = db.Column(db.String(200), nullable=False)
    severity = db.Column(db.String(20), default='info')  # info, warning, critical
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

def role_required(role):
    def decorator(f):
        @wraps(f)
        @login_required
        def decorated_function(*args, **kwargs):
            if current_user.role != role and current_user.role != 'admin':
                return jsonify({'error': 'Insufficient permissions'}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator

# Load initial data from CSV - FIXED: Now inside app context
def load_initial_data():
    with app.app_context():
        # Create tables
        db.create_all()
        
        # Create default admin user if not exists
        if not User.query.filter_by(username='admin').first():
            admin = User(username='admin', password='admin123', role='admin')
            db.session.add(admin)
            db.session.commit()
            logger.info("Default admin user created")
        
        # Load transaction data if no transactions exist
        if Transaction.query.count() == 0:
            try:
                df = pd.read_csv('Appendix1_Transactions.csv')
                df['Revenue'] = df['TransactionAmount'] * df['RevenuePerKwacha']
                
                for _, row in df.iterrows():
                    transaction = Transaction(
                        mobile_booth=row['MobileBooth'],
                        service=row['Service'],
                        transaction_amount=row['TransactionAmount'],
                        revenue_per_kwacha=row['RevenuePerKwacha'],
                        revenue=row['Revenue'],
                        timestamp=datetime.strptime(row['TransactionDate'], '%Y-%m-%d')
                    )
                    db.session.add(transaction)
                
                db.session.commit()
                logger.info("Initial transaction data loaded successfully")
            except Exception as e:
                logger.error(f"Error loading initial data: {e}")
                # Create some sample data if CSV loading fails
                sample_transaction = Transaction(
                    mobile_booth='Wina1',
                    service='Airtel Money',
                    transaction_amount=1000.00,
                    revenue_per_kwacha=0.05,
                    revenue=50.00
                )
                db.session.add(sample_transaction)
                db.session.commit()
                logger.info("Sample transaction created")

# Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    """User login endpoint
    ---
    parameters:
      - name: username
        in: formData
        type: string
        required: true
      - name: password
        in: formData
        type: string
        required: true
    responses:
      200:
        description: Login successful
      401:
        description: Invalid credentials
    """
    if request.method == 'GET':
        return render_template('login.html')
    # Handle both JSON and form data
    if request.is_json:
        data = request.get_json()
    else:
        data = request.form
    username = data.get('username')
    password = data.get('password')
    if not username or not password:
        error = 'Username and password required'
        return render_template('login.html', error=error), 400
    user = User.query.filter_by(username=username).first()
    if user and user.password == password:
        login_user(user)
        # If form submit, redirect to dashboard
        if not request.is_json:
            return render_template('index.html')
        return jsonify({
            'message': 'Login successful',
            'user': {'username': user.username, 'role': user.role}
        })
    error = 'Invalid credentials'
    if not request.is_json:
        return render_template('login.html', error=error), 401
    return jsonify({'error': error}), 401

@app.route('/api/user')
def get_current_user():
    """Get current user info
    ---
    responses:
      200:
        description: Current user data
      401:
        description: Not authenticated
    """
    if current_user.is_authenticated:
        return jsonify({
            'user': {
                'username': current_user.username,
                'role': current_user.role
            }
        })
    return jsonify({'error': 'Not authenticated'}), 401

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return jsonify({'message': 'Logged out successfully'})

@app.route('/dashboard')
@login_required
def dashboard():
    return render_template('index.html')

# API Routes with caching and rate limiting
@app.route('/api/revenue_by_booth')
@cache.cached(timeout=60)
@limiter.limit("100 per minute")
def revenue_by_booth():
    """Get revenue by booth
    ---
    responses:
      200:
        description: Revenue data by booth
    """
    data = db.session.query(
        Transaction.mobile_booth,
        db.func.sum(Transaction.revenue).label('total_revenue')
    ).group_by(Transaction.mobile_booth).all()
    
    return jsonify({booth: float(revenue) for booth, revenue in data})

@app.route('/api/top_services')
@cache.cached(timeout=60)
def top_services():
    data = db.session.query(
        Transaction.service,
        db.func.count(Transaction.id).label('count')
    ).group_by(Transaction.service).order_by(db.desc('count')).limit(5).all()
    
    return jsonify({service: count for service, count in data})

@app.route('/api/revenue_by_service')
@cache.cached(timeout=60)
def revenue_by_service():
    data = db.session.query(
        Transaction.service,
        db.func.sum(Transaction.revenue).label('total_revenue')
    ).group_by(Transaction.service).order_by(db.desc('total_revenue')).limit(10).all()
    
    return jsonify({service: float(revenue) for service, revenue in data})

@app.route('/api/top_booths')
@cache.cached(timeout=60)
def top_booths():
    data = db.session.query(
        Transaction.mobile_booth,
        db.func.sum(Transaction.revenue).label('total_revenue')
    ).group_by(Transaction.mobile_booth).order_by(db.desc('total_revenue')).limit(5).all()
    
    return jsonify({booth: float(revenue) for booth, revenue in data})

@app.route('/api/summary')
@cache.cached(timeout=30)
def summary():
    total_revenue = db.session.query(db.func.sum(Transaction.revenue)).scalar() or 0
    total_transactions = db.session.query(db.func.count(Transaction.id)).scalar()
    unique_services = db.session.query(db.func.count(db.distinct(Transaction.service))).scalar()
    unique_booths = db.session.query(db.func.count(db.distinct(Transaction.mobile_booth))).scalar()
    
    return jsonify({
        'total_revenue': float(total_revenue),
        'total_transactions': total_transactions,
        'unique_services': unique_services,
        'unique_booths': unique_booths
    })

@app.route('/api/service_limits')
def service_limits():
    service_usage = db.session.query(
        Transaction.service,
        db.func.sum(Transaction.revenue).label('total_revenue')
    ).group_by(Transaction.service).all()
    
    usage_dict = {service: revenue for service, revenue in service_usage}
    
    limits_data = []
    for service, limit in SERVICE_LIMITS.items():
        current_usage = usage_dict.get(service, 0)
        remaining = limit - current_usage
        usage_percentage = (current_usage / limit) * 100 if limit > 0 else 0
        
        limits_data.append({
            'service': service,
            'current_usage': float(current_usage),
            'limit': limit,
            'remaining': float(remaining),
            'usage_percentage': usage_percentage,
            'is_low': remaining < (limit * 0.1)
        })
    
    return jsonify(limits_data)

# Advanced Analytics
@app.route('/api/trends')
def trends():
    """Get revenue trends over time
    ---
    responses:
      200:
        description: Revenue trends data
    """
    # Last 30 days trend
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=30)
    
    trends = db.session.query(
        db.func.date(Transaction.timestamp).label('date'),
        db.func.sum(Transaction.revenue).label('daily_revenue')
    ).filter(Transaction.timestamp.between(start_date, end_date)).group_by('date').all()
    
    return jsonify([
        {'date': date.isoformat(), 'revenue': float(revenue)} 
        for date, revenue in trends
    ])

@app.route('/api/benchmarks')
def benchmarks():
    """Get performance benchmarks
    ---
    responses:
      200:
        description: Benchmark data
    """
    avg_revenue_per_booth = db.session.query(
        db.func.avg(db.func.sum(Transaction.revenue))
    ).group_by(Transaction.mobile_booth).scalar() or 0
    
    top_performer = db.session.query(
        Transaction.mobile_booth,
        db.func.sum(Transaction.revenue).label('total_revenue')
    ).group_by(Transaction.mobile_booth).order_by(db.desc('total_revenue')).first()
    
    return jsonify({
        'average_revenue_per_booth': float(avg_revenue_per_booth),
        'top_performer': {
            'booth': top_performer[0] if top_performer else None,
            'revenue': float(top_performer[1]) if top_performer else 0
        },
        'industry_average': 15000.00  # Example benchmark
    })

# Export endpoints
@app.route('/api/export_csv')
@login_required
def export_csv():
    transactions = Transaction.query.all()
    data = [{
        'MobileBooth': t.mobile_booth,
        'Service': t.service,
        'TransactionAmount': t.transaction_amount,
        'Revenue': t.revenue,
        'Timestamp': t.timestamp.isoformat()
    } for t in transactions]
    
    df = pd.DataFrame(data)
    output = io.StringIO()
    df.to_csv(output, index=False)
    output.seek(0)
    
    return send_file(
        io.BytesIO(output.getvalue().encode()),
        mimetype='text/csv',
        as_attachment=True,
        download_name=f'mobile_booth_data_{datetime.utcnow().date()}.csv'
    )

@app.route('/api/alerts')
@login_required
def get_alerts():
    alerts = Alert.query.filter_by(is_read=False).order_by(Alert.created_at.desc()).limit(10).all()
    return jsonify([{
        'id': alert.id,
        'type': alert.type,
        'message': alert.message,
        'severity': alert.severity,
        'created_at': alert.created_at.isoformat()
    } for alert in alerts])

@app.route('/api/alerts/<int:alert_id>/read', methods=['POST'])
@login_required
def mark_alert_read(alert_id):
    alert = Alert.query.get_or_404(alert_id)
    alert.is_read = True
    db.session.commit()
    return jsonify({'message': 'Alert marked as read'})

# Real-time updates via WebSocket
@socketio.on('connect')
def handle_connect():
    logger.info('Client connected')
    emit('connected', {'message': 'Connected to real-time updates'})

@socketio.on('disconnect')
def handle_disconnect():
    logger.info('Client disconnected')

# Error handlers
@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Resource not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    logger.error(f'Server error: {error}')
    return jsonify({'error': 'Internal server error'}), 500

@app.errorhandler(429)
def ratelimit_handler(e):
    return jsonify({'error': 'Rate limit exceeded'}), 429

if __name__ == '__main__':
    # Load initial data when starting the app
    load_initial_data()
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)