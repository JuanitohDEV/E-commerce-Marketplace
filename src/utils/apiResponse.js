/**
 * Successful response
 * @param {object} res 
 * @param {any} data 
 * @param {string} message 
 * @param {number} statusCode - Http code (default 200)
*/

const sendSuccess = (
    res, 
    data = null,
    message = 'OK',
    statusCode = 200
) => {
    const response = {success: true, message};

    if (data !== null) response.data = data;

    return res.status(statusCode).json(response);
};

/**
 * Paginated results - For lists with page, limit, and total
 * @param {object} res
 * @param {array} data  - Items of the current page
 * @param {object} pagination - {page, totalPages, totalItems, hasNextPage }
 * @param {string} message
*/

const sendPaginated = (
    res,
    data,
    pagination,
    message = 'OK'
) => {
    return res.status(200).json({
        success: true,
        message,
        data,
        pagination
    });
};

module.exports = {sendSuccess, sendPaginated};