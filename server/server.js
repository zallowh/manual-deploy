const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();

// 🔧 FIX 1: Proper CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [
        'https://your-frontend-domain.vercel.app', // 👈 UPDATE THIS with your actual frontend URL
        
      ]
    : [
        'http://localhost:3000',    // React default
        
        'http://localhost:3001'    // Alternative port
      ],
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 🔧 FIX 2: Updated MongoDB connection (your variable name)
mongoose.connect(process.env.MDB_CONNECTION_STRING, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("✅ Connected to MongoDB Atlas"))
.catch((err) => console.error("❌ MongoDB connection error:", err));

// 🔧 FIX 3: Enhanced Contact Schema with subject field
const contactSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    trim: true
  },
  subject: {  // 👈 ADDED: Subject field (useful for contact forms)
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  message: {
    type: String,
    required: true,
    trim: true,
    minlength: 10,
    maxlength: 2000
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  isRead: {
    type: Boolean,
    default: false
  },
  // 👈 ADDED: Additional useful fields
  ipAddress: String,
  userAgent: String
});

const Contact = mongoose.model('Contact', contactSchema);

// 🔧 FIX 4: Email transporter with better error handling
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Verify email configuration on startup
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Email configuration error:', error);
  } else {
    console.log('✅ Email server ready');
  }
});

// 🔧 FIX 5: Enhanced validation middleware
const validateContactForm = (req, res, next) => {
  const { name, email, subject, message } = req.body;
  
  // Required field validation
  if (!name || !email || !subject || !message) {
    return res.status(400).json({
      success: false,
      message: 'Name, email, subject, and message are required fields'
    });
  }
  
  // Length validations
  if (name.length < 2 || name.length > 100) {
    return res.status(400).json({
      success: false,
      message: 'Name must be between 2 and 100 characters'
    });
  }
  
  if (message.length < 10 || message.length > 2000) {
    return res.status(400).json({
      success: false,
      message: 'Message must be between 10 and 2000 characters'
    });
  }
  
  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid email address'
    });
  }
  
  next();
};

// Routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'Contact API is running!',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'Server is running', 
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// 🔧 FIX 6: Enhanced contact form submission
app.post('/api/contact', validateContactForm, async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;
    
    // Save to database with additional info
    const contact = new Contact({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || '',
      subject: subject.trim(),
      message: message.trim(),
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });
    
    await contact.save();
    
    // Enhanced email notification
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
      subject: `New Contact: ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px;">
            New Contact Form Submission
          </h2>
          <div style="background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
            <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
            <p><strong>Subject:</strong> ${subject}</p>
            <div style="margin: 20px 0;">
              <strong>Message:</strong>
              <div style="background: white; padding: 15px; border-left: 4px solid #007bff; margin-top: 10px;">
                ${message.replace(/\n/g, '<br>')}
              </div>
            </div>
          </div>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
          <div style="font-size: 12px; color: #666;">
            <p><strong>Submission Details:</strong></p>
            <p>Time: ${new Date().toLocaleString()}</p>
            <p>IP: ${req.ip || 'Unknown'}</p>
            <p>Contact ID: ${contact._id}</p>
          </div>
        </div>
      `,
      text: `
New Contact Form Submission

Name: ${name}
Email: ${email}
Phone: ${phone || 'Not provided'}
Subject: ${subject}

Message:
${message}

Submitted: ${new Date().toLocaleString()}
Contact ID: ${contact._id}
      `
    };
    
    // Send notification email
    try {
      await transporter.sendMail(mailOptions);
      console.log('✅ Email notification sent');
    } catch (emailError) {
      console.error('❌ Email sending failed:', emailError.message);
    }
    
    // Enhanced auto-reply
    const autoReplyOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Thank you for contacting us!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #007bff;">Thank you for your message, ${name}!</h2>
          <p>We've received your message and will get back to you as soon as possible.</p>
          
          <div style="background: #f0f8ff; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">Your Message Summary:</h3>
            <p><strong>Subject:</strong> ${subject}</p>
            <div style="background: white; padding: 15px; border-left: 3px solid #007bff; margin: 10px 0;">
              ${message.replace(/\n/g, '<br>')}
            </div>
            <p style="font-size: 12px; color: #666; margin-bottom: 0;">
              Submitted on: ${new Date().toLocaleString()}
            </p>
          </div>
          
          <p>Best regards,<br><strong>Your Team</strong></p>
        </div>
      `
    };
    
    try {
      await transporter.sendMail(autoReplyOptions);
      console.log('✅ Auto-reply sent');
    } catch (emailError) {
      console.error('❌ Auto-reply failed:', emailError.message);
    }
    
    res.status(201).json({
      success: true,
      message: 'Message sent successfully! We\'ll get back to you soon.',
      id: contact._id
    });
    
  } catch (error) {
    console.error('❌ Contact form error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message. Please try again later.'
    });
  }
});

// Get all contact messages (for admin) - with pagination
app.get('/api/admin/contacts', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const contacts = await Contact.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Contact.countDocuments();
    
    res.json({
      success: true,
      contacts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('❌ Error fetching contacts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contacts'
    });
  }
});

// Mark message as read
app.patch('/api/admin/contacts/:id/read', async (req, res) => {
  try {
    const contact = await Contact.findByIdAndUpdate(
      req.params.id,
      { isRead: true },
      { new: true }
    );
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }
    
    res.json({
      success: true,
      contact
    });
  } catch (error) {
    console.error('❌ Error marking contact as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update contact'
    });
  }
});

// 🔧 FIX 7: Proper error handling middleware
app.use((error, req, res, next) => {
  console.error('❌ Server error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// 🔧 FIX 8: Conditional server start (for Vercel compatibility)
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
  });
}

// 👈 REQUIRED: Export for Vercel
module.exports = app;