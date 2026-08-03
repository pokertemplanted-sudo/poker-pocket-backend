/**
 * Session model for database
 * @param sequelize
 * @param type data types
 * @returns {*|void|target}
 */
module.exports = (sequelize, type) => {
  return sequelize.define('session', {
    id: {
      type: type.UUID,
      defaultValue: type.UUIDV4,
      primaryKey: true
    },
    userId: {type: type.INTEGER, allowNull: false},
    socketId: {type: type.STRING, allowNull: true},
    ipAddress: {type: type.STRING, allowNull: true},
    isValid: {type: type.BOOLEAN, defaultValue: true},
  })
};
