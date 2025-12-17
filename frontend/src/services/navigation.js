let _navigate = null;

export const setNavigator = (nav) => {
    _navigate = nav;
};

export const navigate = (to, options) => {
    if (typeof _navigate === 'function') {
        _navigate(to, options);
        return true;
    }
    return false;
};

const navigation = {
    setNavigator,
    navigate,
};

export default navigation;
