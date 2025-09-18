const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Subtitle = sequelize.define('Subtitle', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  sequence_number: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1
    }
  },
  srt_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'srts',
      key: 'id'
    }
  },
  start_time: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      is: /^\d{2}:\d{2}:\d{2},\d{3}$/ 
    }
  },
  end_time: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      is: /^\d{2}:\d{2}:\d{2},\d{3}$/ 
    }
  },
  text: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  }
}, {
  tableName: 'subtitles',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['srt_id', 'sequence_number']
    }
  ]
});

module.exports = Subtitle;