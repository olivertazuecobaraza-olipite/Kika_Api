export const createPublicError = ({ name, status, publicMessage, cause }) => {
    const error = new Error(publicMessage);
    error.name = name;
    error.status = status;
    error.publicMessage = publicMessage;
    error.cause = cause;
    return error;
};
