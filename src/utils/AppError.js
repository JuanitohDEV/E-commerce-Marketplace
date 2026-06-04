class AppError extends Error {
    constructor(message, statusCode) {
        super(message);

        this.statusCode = statusCode;

        //isOperational = true -> business-as-usual error
        //isOperational = false -> programmer error
        this.isOperational = true; 

        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = AppError;