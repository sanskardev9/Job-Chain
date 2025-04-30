import axios from "axios";

const axiosInstance = axios.create({
    baseURL: 'https://remotive.io/api/',
    // timeout: 10000,
});

export default axiosInstance;
