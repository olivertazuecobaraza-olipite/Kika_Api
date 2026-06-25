export const createPublicError = ({ name, status, message, cause }) => {
    const error = new Error(message);
    error.name = name;
    error.status = status;
    error.publicMessage = message;
    error.cause = cause;
    return error;
};
