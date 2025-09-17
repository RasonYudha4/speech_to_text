const Srt = require('./Srt');
const Subtitle = require('./Subtitle');

// Define associations
Srt.hasMany(Subtitle, {
  foreignKey: 'srt_id',
  as: 'subtitles'
});

Subtitle.belongsTo(Srt, {
  foreignKey: 'srt_id',
  as: 'srt'
});

module.exports = {
  Srt,
  Subtitle
};